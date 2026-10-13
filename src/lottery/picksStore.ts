import { getStore } from '@netlify/blobs';

// What was recommended for each draw: the Monday picks (to grade them the
// following week) and every number handed out so far (so asking the bot again
// never repeats one).

const STORE_NAME = 'lottery';

export interface SavedPicks {
  lotto?: { drawNo: number; games: number[][] };
  pension?: { drawNo: number; numbers: string[] };
}

export interface IssuedNumbers {
  /** Numbers handed out for this draw, weekly picks included (로또 games as "1,2,3,4,5,6"). */
  numbers: string[];
  /** How many times the command was used, to vary the next answer. */
  requests: number;
}

type Game = 'lotto' | 'pension';

function store() {
  return getStore(STORE_NAME, { consistency: 'strong' });
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    return ((await store().get(key, { type: 'json' })) as T | null) ?? null;
  } catch (err) {
    console.error(`Lottery store read failed (${key}):`, err);
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await store().setJSON(key, value);
  } catch (err) {
    console.error(`Lottery store write failed (${key}):`, err);
  }
}

// Keyed by the 로또 draw of the same week (연금 draws on that week's Thursday).
export const readWeeklyPicks = async (lottoDrawNo: number) => (await readJson<SavedPicks>(`picks-${lottoDrawNo}`)) ?? {};
export const saveWeeklyPicks = (lottoDrawNo: number, picks: SavedPicks) => writeJson(`picks-${lottoDrawNo}`, picks);

export async function readIssued(game: Game, drawNo: number): Promise<IssuedNumbers> {
  const saved = await readJson<Partial<IssuedNumbers>>(`issued-${game}-${drawNo}`);
  return { numbers: saved?.numbers ?? [], requests: saved?.requests ?? 0 };
}

export const saveIssued = (game: Game, drawNo: number, issued: IssuedNumbers) => writeJson(`issued-${game}-${drawNo}`, issued);

/** Running tally of how the Monday picks did, graded once per draw. */
export interface PickRecord {
  gradedLotto: number[]; // 로또 draws already counted
  lottoGames: number;
  lottoMatches: number; // numbers matched, summed over all games
  lottoRanks: Record<string, number>; // '1'–'5' → count
  gradedPension: number[];
  pensionWeeks: number;
  pensionWinWeeks: number; // weeks where any 조 won anything
  pensionRanks: Record<string, number>; // '1등', '보너스', '7등' … → count (per 조 ticket)
}

const EMPTY_RECORD: PickRecord = {
  gradedLotto: [],
  lottoGames: 0,
  lottoMatches: 0,
  lottoRanks: {},
  gradedPension: [],
  pensionWeeks: 0,
  pensionWinWeeks: 0,
  pensionRanks: {},
};

export const readRecord = async (): Promise<PickRecord> => ({ ...EMPTY_RECORD, ...(await readJson<PickRecord>('record')) });
export const saveRecord = (record: PickRecord) => writeJson('record', record);
