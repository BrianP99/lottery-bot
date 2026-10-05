import { getStore } from '@netlify/blobs';
import lottoSeed from './data/lottoSeed.json';
import pensionSeed from './data/pensionSeed.json';
import { fetchLottoDraw, fetchPensionDraws, type LottoDraw, type PensionDraw } from './dhlottery';

// Full draw history = the seed bundled in the repo + whatever later draws were
// fetched and cached in Blobs. Each run only asks 동행복권 for draws it doesn't
// have yet, and keeps working from what it has if the site can't be reached.

const STORE_NAME = 'lottery';
const LOTTO_KEY = 'lotto-history';
const PENSION_KEY = 'pension-history';
const MAX_LOTTO_FETCHES_PER_RUN = 12;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
// Draw 1 dates. Neither game has ever skipped a week, so draw N falls N-1 weeks later.
const LOTTO_FIRST_DRAW = Date.UTC(2002, 11, 7); // Saturday
const PENSION_FIRST_DRAW = Date.UTC(2020, 4, 7); // Thursday (연금복권720+ 1회)

function store() {
  return getStore(STORE_NAME, { consistency: 'strong' });
}

function kstToday(now: Date): number {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
}

/** The first draw falling on or after today (KST). Monday morning → this week's Saturday / Thursday. */
export function upcomingDraw(game: 'lotto' | 'pension', now = new Date()): { drawNo: number; date: string } {
  const first = game === 'lotto' ? LOTTO_FIRST_DRAW : PENSION_FIRST_DRAW;
  const drawNo = Math.ceil((kstToday(now) - first) / WEEK_MS) + 1;
  return { drawNo, date: new Date(first + (drawNo - 1) * WEEK_MS).toISOString().slice(0, 10) };
}

function mergeByDraw<T extends { drawNo: number }>(...lists: T[][]): T[] {
  const map = new Map<number, T>();
  for (const list of lists) for (const item of list) map.set(item.drawNo, item);
  return [...map.values()].sort((a, b) => a.drawNo - b.drawNo);
}

async function readCached<T>(key: string): Promise<T[]> {
  try {
    return ((await store().get(key, { type: 'json' })) as T[] | null) ?? [];
  } catch (err) {
    console.error(`Lottery cache read failed (${key}):`, err);
    return [];
  }
}

/**
 * What's already known, without asking 동행복권. For the Discord commands,
 * which must answer within 3 seconds; the Monday job keeps the cache fresh.
 */
export async function loadKnownLottoDraws(): Promise<LottoDraw[]> {
  return mergeByDraw(lottoSeed as LottoDraw[], await readCached<LottoDraw>(LOTTO_KEY));
}

export async function loadKnownPensionDraws(): Promise<PensionDraw[]> {
  return mergeByDraw(pensionSeed as PensionDraw[], await readCached<PensionDraw>(PENSION_KEY));
}

export interface HistoryResult<T> {
  draws: T[];
  /** Set when 동행복권 couldn't be reached; the draws above are then whatever was already known. */
  fetchError: string | null;
}

export async function loadLottoHistory(now = new Date()): Promise<HistoryResult<LottoDraw>> {
  let draws = await loadKnownLottoDraws();
  const have = new Set(draws.map((d) => d.drawNo));
  // Draws held before today (KST). Conservative by a day so a draw that's
  // scheduled but not yet announced is never asked for.
  const lastHeld = upcomingDraw('lotto', new Date(now.getTime() - DAY_MS)).drawNo - 1;
  const wanted: number[] = [];
  for (let n = 1; n <= lastHeld; n++) if (!have.has(n)) wanted.push(n);

  const fetched: LottoDraw[] = [];
  let fetchError: string | null = null;
  // Newest first: the recent draws matter most to this week's analysis.
  for (const n of wanted.reverse().slice(0, MAX_LOTTO_FETCHES_PER_RUN)) {
    try {
      const draw = await fetchLottoDraw(n);
      if (draw) fetched.push(draw);
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err);
      break;
    }
  }

  if (fetched.length) {
    draws = mergeByDraw(draws, fetched);
    try {
      const seedNos = new Set((lottoSeed as LottoDraw[]).map((d) => d.drawNo));
      await store().setJSON(LOTTO_KEY, draws.filter((d) => !seedNos.has(d.drawNo)));
    } catch (err) {
      console.error('Lottery cache write failed (lotto):', err);
    }
  }
  return { draws, fetchError };
}

export async function loadPensionHistory(now = new Date()): Promise<HistoryResult<PensionDraw>> {
  const seed = pensionSeed as PensionDraw[];
  let draws = await loadKnownPensionDraws();
  const lastHeld = upcomingDraw('pension', new Date(now.getTime() - DAY_MS)).drawNo - 1;
  if (draws.at(-1)!.drawNo >= lastHeld) return { draws, fetchError: null };

  try {
    draws = mergeByDraw(draws, await fetchPensionDraws());
  } catch (err) {
    return { draws, fetchError: err instanceof Error ? err.message : String(err) };
  }
  try {
    const seedMax = seed.at(-1)!.drawNo;
    await store().setJSON(PENSION_KEY, draws.filter((d) => d.drawNo > seedMax));
  } catch (err) {
    console.error('Lottery cache write failed (pension):', err);
  }
  return { draws, fetchError: null };
}
