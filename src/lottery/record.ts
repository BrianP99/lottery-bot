import { lottoRank, pensionRank } from './analysis';
import { PENSION_GROUPS } from './format';
import type { LottoDraw, PensionDraw } from './dhlottery';
import type { PickRecord, SavedPicks } from './picksStore';

// Grades last week's Monday picks against the draws and keeps a running tally,
// so whether the scoring does any better than chance is visible over time.
// For reference, a random 로또 game matches 6×6/45 = 0.80 numbers on average
// and wins 5등 or better 2.38% of the time; a random 연금 number wins
// something (끝 1자리 or better) about 10% of weeks.

export interface WeekGrade {
  lines: string[];
  record: PickRecord;
}

export function gradeLastWeek(
  saved: SavedPicks,
  lottoHistory: LottoDraw[],
  pensionHistory: PensionDraw[],
  record: PickRecord,
): WeekGrade {
  const lines: string[] = [];
  const next: PickRecord = {
    ...record,
    lottoRanks: { ...record.lottoRanks },
    pensionRanks: { ...record.pensionRanks },
  };

  const lottoDraw = saved.lotto && lottoHistory.find((d) => d.drawNo === saved.lotto!.drawNo);
  if (saved.lotto && lottoDraw) {
    const games = saved.lotto.games;
    const matches = games.map((g) => g.filter((n) => lottoDraw.numbers.includes(n)).length);
    const ranks = games.map((g) => lottoRank(g, lottoDraw)).filter((r): r is number => r !== null);
    lines.push(
      `**로또 ${lottoDraw.drawNo}회** 당첨번호 ${lottoDraw.numbers.join(' ')} + ${lottoDraw.bonus}\n` +
        `게임별 적중 ${matches.map((m, i) => `${String.fromCharCode(65 + i)}:${m}`).join(' ')} → ` +
        (ranks.length ? `🎉 ${ranks.map((r) => `${r}등`).join(', ')} 당첨!` : '당첨 없음'),
    );
    // Count each draw once, even if the Monday job runs twice.
    if (!next.gradedLotto.includes(lottoDraw.drawNo)) {
      next.gradedLotto = [...next.gradedLotto, lottoDraw.drawNo];
      next.lottoGames += games.length;
      next.lottoMatches += matches.reduce((a, b) => a + b, 0);
      for (const r of ranks) next.lottoRanks[r] = (next.lottoRanks[r] ?? 0) + 1;
    }
  }

  const pensionDraw = saved.pension && pensionHistory.find((d) => d.drawNo === saved.pension!.drawNo);
  if (saved.pension && pensionDraw) {
    // Graded as bought: the first candidate for every 조. Backups or bot
    // numbers used instead aren't known here.
    const number = saved.pension.numbers[0];
    const wins = PENSION_GROUPS.flatMap((g) => {
      const rank = pensionRank(g, number, pensionDraw);
      return rank ? [{ group: g, rank }] : [];
    });
    lines.push(
      `**연금복권 ${pensionDraw.drawNo}회** 1등 ${pensionDraw.group}조 ${pensionDraw.number} · 보너스 ${pensionDraw.bonus}\n` +
        `추천 ${number} (모든조) → ` +
        (wins.length ? `🎉 ${wins.map((w) => `${w.group}조 ${w.rank}`).join(', ')} 당첨!` : '당첨 없음'),
    );
    if (!next.gradedPension.includes(pensionDraw.drawNo)) {
      next.gradedPension = [...next.gradedPension, pensionDraw.drawNo];
      next.pensionWeeks += 1;
      if (wins.length) next.pensionWinWeeks += 1;
      for (const w of wins) next.pensionRanks[w.rank] = (next.pensionRanks[w.rank] ?? 0) + 1;
    }
  }

  return { lines, record: next };
}

const rankList = (ranks: Record<string, number>, order: string[]) =>
  order.filter((r) => ranks[r]).map((r) => `${r} ${ranks[r]}회`).join(' · ');

/** Cumulative results next to what chance alone would give, or null before the first graded week. */
export function recordSummary(record: PickRecord): string | null {
  const parts: string[] = [];
  if (record.lottoGames) {
    const avg = record.lottoMatches / record.lottoGames;
    const ranks = rankList(record.lottoRanks, ['1', '2', '3', '4', '5']).replace(/(\d) /g, '$1등 ');
    parts.push(
      `로또 ${record.gradedLotto.length}주 ${record.lottoGames}게임: 게임당 평균 ${avg.toFixed(2)}개 적중 (무작위 0.80)` +
        ` · 당첨 ${ranks || '없음'} (무작위라면 게임당 5등 이상 2.4%)`,
    );
  }
  if (record.pensionWeeks) {
    const ranks = rankList(record.pensionRanks, ['1등', '2등', '보너스', '3등', '4등', '5등', '6등', '7등']);
    parts.push(
      `연금 ${record.pensionWeeks}주 중 ${record.pensionWinWeeks}주 당첨 (무작위 약 10%)` + (ranks ? ` · ${ranks}` : ''),
    );
  }
  return parts.length ? parts.join('\n') : null;
}
