// Fetches official results from 동행복권. The site was rebuilt in 2025–26 and
// the old `common.do?method=getLottoNumber` JSON API now returns an HTML page,
// so these are the JSON endpoints the new result pages call themselves.

export interface LottoDraw {
  drawNo: number;
  date: string; // YYYY-MM-DD (Asia/Seoul)
  numbers: number[]; // six, ascending
  bonus: number;
}

export interface PensionDraw {
  drawNo: number;
  date: string;
  group: number; // 1등 조 (1–5)
  number: string; // 1등 6자리
  bonus: string; // 보너스 6자리 (every 조)
}

const LOTTO_URL = 'https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd=';
const PENSION_LIST_URL = 'https://www.dhlottery.co.kr/pt720/selectPstPt720WnList.do';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
};

function toIsoDate(raw: unknown): string | null {
  const text = String(raw ?? '').trim();
  const iso = /^\d{8}$/.test(text) ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : text;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

async function getJson(url: string, referer: string): Promise<any> {
  const res = await fetch(url, { headers: { ...HEADERS, Referer: referer }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`동행복권 응답 HTTP ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // An HTML page (maintenance, block page, a moved endpoint) instead of JSON.
    throw new Error('동행복권 응답이 JSON이 아닙니다.');
  }
}

export function parseLottoDraw(raw: any): LottoDraw | null {
  const drawNo = Number(raw?.ltEpsd);
  const date = toIsoDate(raw?.ltRflYmd);
  const numbers = [raw?.tm1WnNo, raw?.tm2WnNo, raw?.tm3WnNo, raw?.tm4WnNo, raw?.tm5WnNo, raw?.tm6WnNo]
    .map(Number)
    .sort((a, b) => a - b);
  const bonus = Number(raw?.bnsWnNo);
  const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= 45;
  if (!Number.isInteger(drawNo) || drawNo < 1 || !date) return null;
  if (!numbers.every(inRange) || new Set(numbers).size !== 6) return null;
  if (!inRange(bonus) || numbers.includes(bonus)) return null;
  return { drawNo, date, numbers, bonus };
}

export function parsePensionDraw(raw: any): PensionDraw | null {
  const drawNo = Number(raw?.psltEpsd);
  const date = toIsoDate(raw?.psltRflYmd);
  const group = Number(raw?.wnBndNo);
  const number = String(raw?.wnRnkVl ?? '').trim();
  const bonus = String(raw?.bnsRnkVl ?? '').trim();
  if (!Number.isInteger(drawNo) || drawNo < 1 || !date) return null;
  if (!Number.isInteger(group) || group < 1 || group > 5) return null;
  if (!/^\d{6}$/.test(number) || !/^\d{6}$/.test(bonus)) return null;
  return { drawNo, date, group, number, bonus };
}

/** One 로또 6/45 draw, or null when that draw hasn't happened yet. Throws on network/format failure. */
export async function fetchLottoDraw(drawNo: number): Promise<LottoDraw | null> {
  const json = await getJson(`${LOTTO_URL}${drawNo}`, 'https://www.dhlottery.co.kr/lt645/intro');
  const row = json?.data?.list?.[0];
  if (!row) return null;
  const draw = parseLottoDraw(row);
  return draw && draw.drawNo === drawNo ? draw : null;
}

/** Every 연금복권720+ draw the site lists. Throws on network/format failure. */
export async function fetchPensionDraws(): Promise<PensionDraw[]> {
  const json = await getJson(PENSION_LIST_URL, 'https://www.dhlottery.co.kr/pt720/result');
  const rows = Array.isArray(json?.data?.result) ? json.data.result : Array.isArray(json?.result) ? json.result : [];
  return rows.map(parsePensionDraw).filter((d: PensionDraw | null): d is PensionDraw => d !== null);
}
