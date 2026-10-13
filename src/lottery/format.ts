// Discord text shared by the Monday message and the bot commands. Code blocks
// keep the digits aligned and easy to copy into the purchase page.

export const PENSION_GROUPS = [1, 2, 3, 4, 5];

/** Each game, with every number's score on the line below it when `scores` is given. */
export function lottoGamesBlock(games: number[][], scores?: number[]): string {
  // Five-character columns so a number and its score ("1.21") line up.
  const lines = games.flatMap((g, i) => {
    const game = `${String.fromCharCode(65 + i)}${g.map((n) => String(n).padStart(5)).join('')}`;
    return scores ? [game, ` ${g.map((n) => scores[n].toFixed(2).padStart(5)).join('')}`] : [game];
  });
  return `\`\`\`\n${lines.join('\n')}\n\`\`\``;
}

/** e.g. "4(1.12) 6(0.98) 1(1.05) …" — each digit of `number` with its position score. */
export function pensionScoreLine(number: string, positionScores: number[][]): string {
  return number
    .split('')
    .map((d, pos) => `${d}(${positionScores[pos][Number(d)].toFixed(2)})`)
    .join(' ');
}

export const SCORE_NOTE = '점수 = 역대 빈도 50% + 최근 52회 빈도 30% + 미출현 기간 20% (1.00이 평균)';

const spaced = (number: string) => number.split('').join(' ');

/** First number for every 조, the rest listed as backups. */
export function pensionAllGroupsBlock(numbers: string[]): string {
  const main = PENSION_GROUPS.map((g) => `${g}조  ${spaced(numbers[0])}`).join('\n');
  const backups = numbers.slice(1).map((n, i) => `예비${i + 1} ${spaced(n)}`).join('\n');
  return `\`\`\`\n${main}${backups ? `\n\n${backups}` : ''}\n\`\`\``;
}

/** Candidates for one 조 whose usual number was sold out. */
export function pensionOneGroupBlock(group: number, numbers: string[]): string {
  return `\`\`\`\n${numbers.map((n, i) => `${i + 1}순위  ${group}조  ${spaced(n)}`).join('\n')}\n\`\`\``;
}

export const SOLD_OUT_HINT = '이미 팔린 번호면 디스코드에서 `/연금`(전체 새 번호) 또는 `/연금 조:3`(그 조만 새 번호)을 입력하세요.';

// Draw and sales-close times (KST), per 동행복권: 로또 is drawn Saturday 20:35
// with sales closing 20:00; 연금 Thursday 19:05, closing 17:00.
const SCHEDULE = {
  lotto: { weekday: '토', drawTime: '20:35', salesClose: '20:00' },
  pension: { weekday: '목', drawTime: '19:05', salesClose: '17:00' },
} as const;

/** e.g. "**제1246회** · 10월 17일(토) 20:35 추첨 · 구매 마감 당일 20:00" */
export function drawInfoLine(game: 'lotto' | 'pension', drawNo: number, isoDate: string): string {
  const [, month, day] = isoDate.split('-').map(Number);
  const s = SCHEDULE[game];
  return `**제${drawNo}회** · ${month}월 ${day}일(${s.weekday}) ${s.drawTime} 추첨 · 구매 마감 당일 ${s.salesClose}`;
}
