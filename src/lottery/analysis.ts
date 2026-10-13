import type { LottoDraw, PensionDraw } from './dhlottery';

// Every draw is independent and uniformly random, so no amount of history
// changes the odds of any combination; a backtest over 1044 draws found no
// weighting that beats chance. The scores are a data-based ranking to pick
// from, not a prediction: picks are handed out from the highest total score
// down, and the running record in record.ts shows how they fare.

const RECENT_WINDOW = 52; // ≈ one year of weekly draws
const LOTTO_POOL = 22; // games are built from the highest-scoring numbers
const PENSION_DIGITS_PER_POSITION = 5;

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))];
}

/**
 * Blends all-time frequency, last-year frequency, and how long it's been
 * since each value last appeared, each scaled to a mean of 1. The floor keeps
 * every value possible.
 */
function blendWeights(allTime: number[], recent: number[], gap: number[]): number[] {
  const cappedGap = gap.map((g) => Math.min(g, 30));
  const [ma, mr, mg] = [mean(allTime) || 1, mean(recent) || 1, mean(cappedGap) || 1];
  return allTime.map((_, i) => Math.max(0.2, 0.5 * (allTime[i] / ma) + 0.3 * (recent[i] / mr) + 0.2 * (cappedGap[i] / mg)));
}

// ─── 로또 6/45 ────────────────────────────────────────────────────────────────

export interface LottoStats {
  drawCount: number;
  latestDrawNo: number;
  /** Each number's score (index = number, 0 unused); 1.00 is average. */
  scores: number[];
  topScores: { number: number; score: number }[];
  coldOverdue: { number: number; gap: number }[]; // longest since last drawn
  sumRange: [number, number]; // middle 80% of historical sums
  filterPassRate: number; // share of past winning combos that pass every filter
}

export interface LottoPicks {
  games: number[][];
  stats: LottoStats;
}

function maxRun(sortedNums: number[]): number {
  let best = 1;
  let run = 1;
  for (let i = 1; i < sortedNums.length; i++) {
    run = sortedNums[i] === sortedNums[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

function lottoShapeOk(nums: number[], sumRange: [number, number]): boolean {
  const sum = nums.reduce((a, b) => a + b, 0);
  const odd = nums.filter((n) => n % 2 === 1).length;
  const low = nums.filter((n) => n <= 22).length;
  return sum >= sumRange[0] && sum <= sumRange[1] && odd >= 2 && odd <= 4 && low >= 2 && low <= 4 && maxRun(nums) <= 2;
}

/**
 * The highest-scoring games that pass every filter, best first. `exclude`
 * holds games ("1,2,3,4,5,6") already handed out for this draw, so each
 * request continues down the ranking: the Monday picks are the top set, the
 * first /로또 the next one, and so on.
 */
export function generateLottoPicks(history: LottoDraw[], gameCount = 5, exclude: Iterable<string> = []): LottoPicks {
  const recent = history.slice(-RECENT_WINDOW);
  const allTime = new Array(46).fill(0);
  const recentFreq = new Array(46).fill(0);
  const lastSeen = new Array(46).fill(0);
  for (const d of history) for (const n of d.numbers) {
    allTime[n]++;
    lastSeen[n] = d.drawNo;
  }
  for (const d of recent) for (const n of d.numbers) recentFreq[n]++;

  const latestDrawNo = history.at(-1)!.drawNo;
  const gap = lastSeen.map((s) => latestDrawNo - s);
  // Index 0 is unused (numbers are 1–45), so give it zero weight.
  const weights = blendWeights(allTime, recentFreq, gap).map((w, i) => (i === 0 ? 0 : w));

  const sums = history.map((d) => d.numbers.reduce((a, b) => a + b, 0)).sort((a, b) => a - b);
  const sumRange: [number, number] = [percentile(sums, 0.1), percentile(sums, 0.9)];
  const skip = new Set([...history.map((d) => d.numbers.join(',')), ...exclude]);

  const numbers = Array.from({ length: 45 }, (_, i) => i + 1);
  const pool = numbers
    .slice()
    .sort((a, b) => weights[b] - weights[a] || a - b)
    .slice(0, LOTTO_POOL)
    .sort((a, b) => a - b);
  const ranked: { total: number; nums: number[] }[] = [];
  const pick: number[] = [];
  (function choose(start: number) {
    if (pick.length === 6) {
      if (lottoShapeOk(pick, sumRange) && !skip.has(pick.join(','))) {
        ranked.push({ total: pick.reduce((t, n) => t + weights[n], 0), nums: [...pick] });
      }
      return;
    }
    for (let i = start; i < pool.length; i++) {
      pick.push(pool[i]);
      choose(i + 1);
      pick.pop();
    }
  })(0);
  ranked.sort((a, b) => b.total - a.total || a.nums.join(',').localeCompare(b.nums.join(',')));

  const games: number[][] = [];
  for (const { nums } of ranked) {
    // Within one set, spread the games out instead of five near-copies of the top game.
    if (games.some((g) => g.filter((n) => nums.includes(n)).length > 2)) continue;
    games.push(nums);
    if (games.length === gameCount) break;
  }

  return {
    games,
    stats: {
      drawCount: history.length,
      latestDrawNo,
      scores: weights,
      topScores: numbers
        .map((n) => ({ number: n, score: weights[n] }))
        .sort((a, b) => b.score - a.score || a.number - b.number)
        .slice(0, 6),
      coldOverdue: numbers
        .map((n) => ({ number: n, gap: gap[n] }))
        .sort((a, b) => b.gap - a.gap || a.number - b.number)
        .slice(0, 5),
      sumRange,
      filterPassRate: history.filter((d) => lottoShapeOk(d.numbers, sumRange)).length / history.length,
    },
  };
}

/** 1–5 for a winning game, null otherwise. */
export function lottoRank(game: number[], draw: LottoDraw): number | null {
  const hits = game.filter((n) => draw.numbers.includes(n)).length;
  if (hits === 6) return 1;
  if (hits === 5) return game.includes(draw.bonus) ? 2 : 3;
  if (hits === 4) return 4;
  if (hits === 3) return 5;
  return null;
}

// ─── 연금복권720+ ─────────────────────────────────────────────────────────────

export interface PensionStats {
  drawCount: number;
  latestDrawNo: number;
  topDigitByPosition: number[]; // most frequent digit per position, all-time
  /** Score of each digit 0–9 at each of the six positions; 1.00 is average. */
  positionScores: number[][];
  groupCounts: number[]; // 1등 조 frequency, index 1–5
}

export interface PensionPicks {
  /**
   * Distinct six-digit candidates in order of preference. The first is bought
   * for every 조 ("모든조", 5 tickets); the rest are backups, because each
   * 조+번호 exists only once in the online pool and may already be sold.
   */
  numbers: string[];
  stats: PensionStats;
}

/**
 * The highest-scoring numbers, best first. `exclude` holds numbers already
 * handed out for this draw, so asking again continues down the ranking.
 */
export function generatePensionPicks(history: PensionDraw[], count = 3, exclude: Iterable<string> = []): PensionPicks {
  // Each of the six positions is drawn separately (0–9), so analyse them separately.
  const recent = history.slice(-RECENT_WINDOW);
  const latestDrawNo = history.at(-1)!.drawNo;
  const positionWeights: number[][] = [];
  const topDigitByPosition: number[] = [];
  for (let pos = 0; pos < 6; pos++) {
    const allTime = new Array(10).fill(0);
    const recentFreq = new Array(10).fill(0);
    const lastSeen = new Array(10).fill(0);
    for (const d of history) {
      const digit = Number(d.number[pos]);
      allTime[digit]++;
      lastSeen[digit] = d.drawNo;
    }
    for (const d of recent) recentFreq[Number(d.number[pos])]++;
    positionWeights.push(blendWeights(allTime, recentFreq, lastSeen.map((s) => latestDrawNo - s)));
    topDigitByPosition.push(allTime.indexOf(Math.max(...allTime)));
  }

  const skip = new Set([...history.flatMap((d) => [d.number, d.bonus]), ...exclude]);
  // Every number built from each position's top digits, ranked by total score.
  const topDigits = positionWeights.map((w) =>
    w
      .map((score, digit) => ({ score, digit }))
      .sort((a, b) => b.score - a.score || a.digit - b.digit)
      .slice(0, PENSION_DIGITS_PER_POSITION),
  );
  let ranked: { total: number; number: string }[] = [{ total: 0, number: '' }];
  for (const options of topDigits) {
    ranked = ranked.flatMap((r) => options.map((o) => ({ total: r.total + o.score, number: r.number + o.digit })));
  }
  ranked.sort((a, b) => b.total - a.total || a.number.localeCompare(b.number));

  const numbers: string[] = [];
  for (const { number } of ranked) {
    // Skip numbers people favour (mostly one digit), ones that already came up,
    // and ones already handed out.
    if (new Set(number).size < 3 || skip.has(number)) continue;
    // Backups should differ in the last digits, which decide 3등–7등.
    if (numbers.some((n) => n.slice(-3) === number.slice(-3))) continue;
    numbers.push(number);
    if (numbers.length === count) break;
  }

  const groupCounts = new Array(6).fill(0);
  for (const d of history) groupCounts[d.group]++;
  return {
    numbers,
    stats: { drawCount: history.length, latestDrawNo, topDigitByPosition, positionScores: positionWeights, groupCounts },
  };
}

/**
 * The 등위 one ticket wins, or null. A ticket matching several 등위 is paid
 * only the highest, so only that one is returned: 1등 > 2등 > 보너스 > 3등 … 7등.
 */
export function pensionRank(group: number, number: string, draw: PensionDraw): string | null {
  if (number === draw.number) return group === draw.group ? '1등' : '2등';
  if (number === draw.bonus) return '보너스';
  let suffix = 0;
  while (suffix < 6 && number[5 - suffix] === draw.number[5 - suffix]) suffix++;
  // 끝 5자리 → 3등 … 끝 1자리 → 7등
  return suffix >= 1 ? `${8 - suffix}등` : null;
}
