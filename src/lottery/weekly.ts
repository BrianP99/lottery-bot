import { postToDiscord, type DiscordNotifyResult } from '../discord';
import { generateLottoPicks, generatePensionPicks, type LottoPicks, type PensionPicks } from './analysis';
import { loadLottoHistory, loadPensionHistory, upcomingDraw } from './history';
import {
  lottoGamesBlock,
  ODDS_NOTE,
  pensionAllGroupsLabels,
  pensionBlock,
  scheduleLine,
  SCORE_NOTE,
  SOLD_OUT_HINT,
} from './format';
import {
  readIssued,
  readRecord,
  readWeeklyPicks,
  saveIssued,
  saveRecord,
  saveWeeklyPicks,
  type PickRecord,
  type SavedPicks,
} from './picksStore';
import { gradeLastWeek, recordSummary } from './record';

const LOTTO_GAMES = 5; // 1,000원 × 5 = 5,000원
const PENSION_CANDIDATES = 3; // 모든조 1순위 (1,000원 × 5 = 5,000원) + 예비 2개

export interface WeeklyLotteryResult {
  lottoDrawNo: number;
  lotto: LottoPicks;
  pensionDrawNo: number;
  pension: PensionPicks;
  warnings: string[];
  /** The running tally with last week included; saved by runWeeklyLottery. */
  record: PickRecord;
  payload: unknown;
}

/** Builds this week's picks and the Discord message without sending or saving anything. */
export async function buildWeeklyLottery(now = new Date()): Promise<WeeklyLotteryResult> {
  const [lottoHistory, pensionHistory] = await Promise.all([loadLottoHistory(now), loadPensionHistory(now)]);
  const lottoTarget = upcomingDraw('lotto', now);
  const pensionTarget = upcomingDraw('pension', now);

  // The top of the ranking; /로또 and /연금 continue from where this leaves off.
  const lotto = generateLottoPicks(lottoHistory.draws, LOTTO_GAMES);
  const pension = generatePensionPicks(pensionHistory.draws, PENSION_CANDIDATES);

  // If the history is behind, say so: the picks are still valid, but the analysis is missing recent draws.
  const warnings: string[] = [];
  if (lottoHistory.draws.at(-1)!.drawNo < lottoTarget.drawNo - 1) {
    warnings.push(`로또 최신 회차를 못 가져와 ${lotto.stats.latestDrawNo}회까지로 분석했습니다. (${lottoHistory.fetchError ?? '데이터 없음'})`);
  }
  if (pensionHistory.draws.at(-1)!.drawNo < pensionTarget.drawNo - 1) {
    warnings.push(`연금복권 최신 회차를 못 가져와 ${pension.stats.latestDrawNo}회까지로 분석했습니다. (${pensionHistory.fetchError ?? '데이터 없음'})`);
  }

  const [previous, record] = await Promise.all([readWeeklyPicks(lottoTarget.drawNo - 1), readRecord()]);
  const graded = gradeLastWeek(previous, lottoHistory.draws, pensionHistory.draws, record);
  const summary = recordSummary(graded.record);
  const { stats: ls } = lotto;
  const { stats: ps } = pension;

  const lottoEmbed = {
    title: `🎱 로또 6/45 · ${lottoTarget.drawNo}회`,
    description:
      `${scheduleLine('lotto', lottoTarget.date)}\n` +
      `**점수 1~5위 · 5게임 5,000원**\n${lottoGamesBlock(lotto.games, ls.scores)}`,
    color: 0xfbbf24,
    fields: [
      { name: '🔥 점수 높은 번호', value: ls.topScores.map((t) => `${t.number}`).join(' · '), inline: true },
      { name: '❄️ 오래 안 나온 번호', value: ls.coldOverdue.map((c) => `${c.number} (${c.gap}회)`).join(' · '), inline: true },
    ],
  };

  const pensionEmbed = {
    title: `🎫 연금복권720+ · ${pensionTarget.drawNo}회`,
    description:
      `${scheduleLine('pension', pensionTarget.date)}\n` +
      `**모든조 5,000원** (1~5조를 같은 번호로)\n` +
      `${pensionBlock(pension.numbers, pensionAllGroupsLabels(pension.numbers.length), ps.positionScores)}\n` +
      SOLD_OUT_HINT,
    color: 0x22c55e,
  };

  const resultEmbed =
    graded.lines.length || summary
      ? {
          title: '📋 지난주 결과',
          description: [...graded.lines, ...(summary ? [summary] : [])].join('\n\n'),
          color: 0x6366f1,
        }
      : null;

  // The last embed carries the footnote: how scores work and what they don't do.
  const notes = [
    SCORE_NOTE,
    `조건: 합계 ${ls.sumRange[0]}~${ls.sumRange[1]} · 홀짝 2~4개 · 1~22 사이 2~4개 · 3연속 제외 · 역대 1등 조합 제외`,
    ODDS_NOTE,
  ].join('\n');
  const embeds: Record<string, unknown>[] = [lottoEmbed, pensionEmbed, ...(resultEmbed ? [resultEmbed] : [])];
  embeds[embeds.length - 1] = { ...embeds[embeds.length - 1], footer: { text: notes }, timestamp: now.toISOString() };
  if (warnings.length) embeds.push({ description: `⚠️ ${warnings.join('\n⚠️ ')}`, color: 0xef4444 });

  return {
    lottoDrawNo: lottoTarget.drawNo,
    lotto,
    pensionDrawNo: pensionTarget.drawNo,
    pension,
    warnings,
    record: graded.record,
    payload: { username: '복권 번호 알림봇', embeds },
  };
}

/** Builds, sends to Discord, and remembers the picks so next week can check them. */
export async function runWeeklyLottery(now = new Date()): Promise<{ result: WeeklyLotteryResult; notify: DiscordNotifyResult }> {
  const result = await buildWeeklyLottery(now);
  const notify = await postToDiscord(result.payload);
  const saved: SavedPicks = {
    lotto: { drawNo: result.lottoDrawNo, games: result.lotto.games },
    pension: { drawNo: result.pensionDrawNo, numbers: result.pension.numbers },
  };
  await Promise.all([saveWeeklyPicks(result.lottoDrawNo, saved), saveRecord(result.record)]);
  // So the bot's "다른 번호" never hands back one of these.
  const [issuedPension, issuedLotto] = await Promise.all([
    readIssued('pension', result.pensionDrawNo),
    readIssued('lotto', result.lottoDrawNo),
  ]);
  await Promise.all([
    saveIssued('pension', result.pensionDrawNo, {
      ...issuedPension,
      numbers: [...new Set([...issuedPension.numbers, ...result.pension.numbers])],
    }),
    saveIssued('lotto', result.lottoDrawNo, {
      ...issuedLotto,
      numbers: [...new Set([...issuedLotto.numbers, ...result.lotto.games.map((g) => g.join(','))])],
    }),
  ]);
  return { result, notify };
}
