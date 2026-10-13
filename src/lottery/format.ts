// Discord text shared by the Monday message and the bot commands. Code blocks
// keep the digits aligned and easy to copy into the purchase page.

export const PENSION_GROUPS = [1, 2, 3, 4, 5];

export function lottoGamesBlock(games: number[][]): string {
  const lines = games.map((g, i) => `${String.fromCharCode(65 + i)}  ${g.map((n) => String(n).padStart(2, ' ')).join('  ')}`);
  return `\`\`\`\n${lines.join('\n')}\n\`\`\``;
}

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
