import type { LottoDraw, PensionDraw } from './dhlottery';

// Every draw is independent and uniformly random, so no amount of history
// changes the odds of any combination. What history *can* do is steer away
// from picks that are common among other buyers (birthdays, runs, patterns)
// and toward shapes that winning combinations usually have — which doesn't
// raise the chance of winning, but avoids splitting a prize if it happens.
// The weighting below is for flavour; the filters are the meaningful part.

const RECENT_WINDOW = 52; // ≈ one year of weekly draws

/** Small seeded PRNG so re-running for the same draw returns the same picks. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick(weights: number[], rand: () => number, exclude: Set<number> = new Set()): number {
  let total = 0;
  for (let i = 0; i < weights.length; i++) if (!exclude.has(i)) total += weights[i];
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    if (exclude.has(i)) continue;
    r -= weights[i];
    if (r <= 0) return i;
  }
  // Floating-point leftovers: fall back to the last eligible index.
  for (let i = weights.length - 1; i >= 0; i--) if (!exclude.has(i)) return i;
  throw new Error('no eligible index');
}

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
  hotRecent: number[]; // most frequent over the last RECENT_WINDOW draws
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

/** `salt` 0 is the weekly pick; each later request for the same draw passes a new salt for fresh games. */
export function generateLottoPicks(history: LottoDraw[], targetDrawNo: number, gameCount = 5, salt = 0): LottoPicks {
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
  const pastCombos = new Set(history.map((d) => d.numbers.join(',')));

  const rand = mulberry32(targetDrawNo * 7919 + 645 + salt * 104729);
  const games: number[][] = [];
  for (let attempt = 0; games.length < gameCount && attempt < 20000; attempt++) {
    const picked = new Set<number>([0]);
    while (picked.size < 7) picked.add(weightedPick(weights, rand, picked));
    picked.delete(0);
    const nums = [...picked].sort((a, b) => a - b);
    if (!lottoShapeOk(nums, sumRange)) continue;
    if (pastCombos.has(nums.join(','))) continue;
    // Spread the five games out instead of betting on the same few numbers.
    if (games.some((g) => g.filter((n) => nums.includes(n)).length > 2)) continue;
    games.push(nums);
  }

  const byCount = (a: number, b: number) => recentFreq[b] - recentFreq[a] || a - b;
  const numbers = Array.from({ length: 45 }, (_, i) => i + 1);
  return {
    games,
    stats: {
      drawCount: history.length,
      latestDrawNo,
      hotRecent: numbers.slice().sort(byCount).slice(0, 6).sort((a, b) => a - b),
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
 * `exclude` holds numbers already handed out for this draw, so asking again
 * never repeats one; `salt` varies the sequence between requests.
 */
export function generatePensionPicks(
  history: PensionDraw[],
  targetDrawNo: number,
  count = 3,
  exclude: Iterable<string> = [],
  salt = 0,
): PensionPicks {
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
  const rand = mulberry32(targetDrawNo * 7919 + 720 + salt * 104729);
  const numbers: string[] = [];
  for (let attempt = 0; numbers.length < count && attempt < 10000; attempt++) {
    const number = positionWeights.map((w) => weightedPick(w, rand)).join('');
    // Skip numbers people favour (mostly one digit), ones that already came up,
    // and ones already handed out.
    if (new Set(number).size < 3 || skip.has(number)) continue;
    // Backups should differ in the last digits, which decide 3등–7등.
    if (numbers.some((n) => n.slice(-3) === number.slice(-3))) continue;
    skip.add(number);
    numbers.push(number);
  }

  const groupCounts = new Array(6).fill(0);
  for (const d of history) groupCounts[d.group]++;
  return { numbers, stats: { drawCount: history.length, latestDrawNo, topDigitByPosition, groupCounts } };
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
