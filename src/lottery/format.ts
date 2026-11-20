// Discord text shared by the Monday message and the bot commands. Numbers go
// in code blocks so the columns line up and they're easy to read off while
// buying; everything else is kept to a line or two so the message reads well
// on a phone.

export const PENSION_GROUPS = [1, 2, 3, 4, 5];

export const SCORE_NOTE = '점수 = 역대 빈도 50% + 최근 52회 30% + 미출현 기간 20% (평균 1.00)';
export const ODDS_NOTE = '점수는 고르는 기준일 뿐, 당첨 확률은 모든 번호가 같아요';

// Draw and sales-close times (KST), per 동행복권: 로또 is drawn Saturday 20:35
// with sales closing 20:00; 연금 Thursday 19:05, closing 17:00.
const SCHEDULE = {
  lotto: { weekday: '토', drawTime: '20:35', salesClose: '20:00' },
  pension: { weekday: '목', drawTime: '19:05', salesClose: '17:00' },
} as const;

/** e.g. "📅 10월 17일(토) 20:35 추첨 · ⏰ 구매 마감 20:00" */
export function scheduleLine(game: 'lotto' | 'pension', isoDate: string): string {
  const [, month, day] = isoDate.split('-').map(Number);
  const s = SCHEDULE[game];
  return `📅 ${month}월 ${day}일(${s.weekday}) ${s.drawTime} 추첨 · ⏰ 구매 마감 ${s.salesClose}`;
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
export const lottoGameScore = (game: number[], scores: number[]) => avg(game.map((n) => scores[n]));
export const pensionNumberScore = (number: string, positionScores: number[][]) =>
  avg(number.split('').map((d, pos) => positionScores[pos][Number(d)]));

/**
 * One game per line with its average score at the end:
 *   A │  3  6 15 17 30 31 │ 1.25
 */
export function lottoGamesBlock(games: number[][], scores: number[]): string {
  const lines = games.map(
    (g, i) =>
      `${String.fromCharCode(65 + i)} │ ${g.map((n) => String(n).padStart(2)).join(' ')} │ ${lottoGameScore(g, scores).toFixed(2)}`,
  );
  return `\`\`\`\n${lines.join('\n')}\n\`\`\``;
}

/**
 * One number per line, digits first so they line up (Korean labels would
 * throw the columns off in a code block), then its average score and label:
 *   8 4 7 3 6 8 │ 1.30  모든조 (1~5조)
 */
export function pensionBlock(numbers: string[], labels: string[], positionScores: number[][]): string {
  const lines = numbers.map(
    (n, i) => `${n.split('').join(' ')} │ ${pensionNumberScore(n, positionScores).toFixed(2)}  ${labels[i] ?? ''}`.trimEnd(),
  );
  return `\`\`\`\n${lines.join('\n')}\n\`\`\``;
}

export const pensionAllGroupsLabels = (count: number) =>
  ['모든조 (1~5조)', ...Array.from({ length: count - 1 }, (_, i) => `예비 ${i + 1}`)];

export const pensionOneGroupLabels = (group: number, count: number) =>
  Array.from({ length: count }, (_, i) => `${group}조 ${i + 1}순위`);

export const SOLD_OUT_HINT = '이미 팔렸으면 예비 번호로, 다 팔렸으면 `/연금` · 한 조만 팔렸으면 `/연금 조:3`';
