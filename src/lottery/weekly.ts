import { postToDiscord, type DiscordNotifyResult } from '../discord';
import { generateLottoPicks, generatePensionPicks, type LottoPicks, type PensionPicks } from './analysis';
import { loadLottoHistory, loadPensionHistory, upcomingDraw } from './history';
import {
  drawInfoLine,
  lottoGamesBlock,
  pensionAllGroupsBlock,
  pensionScoreLine,
  PENSION_GROUPS,
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

  const lotto = generateLottoPicks(lottoHistory.draws, lottoTarget.drawNo, LOTTO_GAMES);
  const pension = generatePensionPicks(pensionHistory.draws, pensionTarget.drawNo, PENSION_CANDIDATES);

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

  const embeds = [
    {
      title: `🎱 로또 6/45 제${lottoTarget.drawNo}회 추천번호`,
      description: `${drawInfoLine('lotto', lottoTarget.drawNo, lottoTarget.date)}\n5게임 · 5,000원 (숫자 아래는 번호별 점수)\n${lottoGamesBlock(lotto.games, ls.scores)}`,
      color: 0xfbbf24,
      fields: [
        { name: '점수 TOP 6', value: ls.topScores.map((t) => `${t.number}(${t.score.toFixed(2)})`).join(' '), inline: true },
        { name: '오래 안 나온 번호', value: ls.coldOverdue.map((c) => `${c.number}(${c.gap}회)`).join(', '), inline: true },
        {
          name: '적용한 조건',
          value:
            `합계 ${ls.sumRange[0]}~${ls.sumRange[1]} · 홀짝 2~4개 · 낮은수(1~22) 2~4개 · 3연속 번호 제외 · 역대 1등 조합 제외 · 게임 간 겹침 2개 이하\n` +
            `(역대 1등 조합 ${ls.drawCount}개 중 ${Math.round(ls.filterPassRate * 100)}%가 이 조건 충족)`,
        },
      ],
    },
    {
      title: `🎫 연금복권720+ 제${pensionTarget.drawNo}회 추천번호`,
      description: `${drawInfoLine('pension', pensionTarget.drawNo, pensionTarget.date)}\n모든조(1~5조) · 5,000원\n${pensionAllGroupsBlock(pension.numbers)}\n${SOLD_OUT_HINT}`,
      color: 0x22c55e,
      fields: [
        { name: '1순위 번호 자리별 점수', value: pensionScoreLine(pension.numbers[0], ps.positionScores) },
        { name: '자리별 역대 최다 숫자', value: ps.topDigitByPosition.join(' '), inline: true },
        {
          name: '1등 조 분포',
          value: PENSION_GROUPS.map((g) => `${g}조 ${ps.groupCounts[g]}회`).join(' · '),
          inline: true,
        },
      ],
    },
    ...(graded.lines.length || summary
      ? [
          {
            title: '📋 지난주 번호 결과',
            description: [...graded.lines, ...(summary ? [`**누적 성적**\n${summary}`] : [])].join('\n\n'),
            color: 0x6366f1,
          },
        ]
      : []),
    {
      description:
        `※ ${SCORE_NOTE}. 추첨은 매회 독립적인 무작위라 점수로 당첨 확률이 오르지는 않습니다.` +
        (warnings.length ? `\n⚠️ ${warnings.join('\n⚠️ ')}` : ''),
      color: 0x9ca3af,
      timestamp: now.toISOString(),
    },
  ];

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
