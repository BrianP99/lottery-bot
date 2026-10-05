import { generateLottoPicks, generatePensionPicks } from './analysis';
import { lottoGamesBlock, pensionAllGroupsBlock, pensionOneGroupBlock } from './format';
import { loadKnownLottoDraws, loadKnownPensionDraws, upcomingDraw } from './history';
import { readIssued, saveIssued } from './picksStore';

// Discord slash commands for when a recommended number can't be bought:
// each 연금 조+번호 exists once in the online pool, so it may already be sold.

/** Definitions sent to Discord when the commands are registered. */
export const COMMAND_DEFINITIONS = [
  {
    name: '연금',
    description: '연금복권720+ 다른 추천번호 (이미 팔렸을 때)',
    type: 1,
    options: [
      {
        type: 4, // INTEGER
        name: '조',
        description: '이 조만 새 번호로 받기 (나머지 조는 원래 번호로 구매)',
        required: false,
        choices: [1, 2, 3, 4, 5].map((g) => ({ name: `${g}조`, value: g })),
      },
    ],
  },
  { name: '로또', description: '로또 6/45 새 추천번호 5게임', type: 1 },
];

const HOUR_MS = 60 * 60 * 1000;

// Sales for a draw close before it's held (연금 목 17:00, 로또 토 20:00 KST),
// after which purchases go to the next draw. Shifting "now" past the close
// makes upcomingDraw() roll over at the right moment.
const pensionDrawOnSale = (now: Date) => upcomingDraw('pension', new Date(now.getTime() + 7 * HOUR_MS));
const lottoDrawOnSale = (now: Date) => upcomingDraw('lotto', new Date(now.getTime() + 4 * HOUR_MS));

export interface CommandReply {
  content?: string;
  embeds?: unknown[];
}

async function pensionReply(group: number | null, now: Date): Promise<CommandReply> {
  const target = pensionDrawOnSale(now);
  const [history, issued] = await Promise.all([loadKnownPensionDraws(), readIssued('pension', target.drawNo)]);
  const salt = issued.requests + 1;
  const { numbers } = generatePensionPicks(history, target.drawNo, 3, issued.numbers, salt);
  await saveIssued('pension', target.drawNo, { numbers: [...issued.numbers, ...numbers], requests: salt });

  return {
    embeds: [
      {
        title: `🎫 연금복권720+ 제${target.drawNo}회 다른 추천번호`,
        description: group
          ? `${group}조만 새 번호로 사고, 나머지 조는 원래 번호로 사세요.\n${pensionOneGroupBlock(group, numbers)}`
          : `모든조(1~5조) · 5,000원\n${pensionAllGroupsBlock(numbers)}`,
        color: 0x22c55e,
        footer: { text: '이번 회차에 이미 추천한 번호와 역대 당첨번호는 제외했습니다.' },
      },
    ],
  };
}

async function lottoReply(now: Date): Promise<CommandReply> {
  const target = lottoDrawOnSale(now);
  const [history, issued] = await Promise.all([loadKnownLottoDraws(), readIssued('lotto', target.drawNo)]);
  const salt = issued.requests + 1;
  const { games } = generateLottoPicks(history, target.drawNo, 5, salt);
  await saveIssued('lotto', target.drawNo, { ...issued, requests: salt });

  return {
    embeds: [
      {
        title: `🎱 로또 6/45 제${target.drawNo}회 새 추천번호`,
        description: `5게임 · 5,000원\n${lottoGamesBlock(games)}`,
        color: 0xfbbf24,
      },
    ],
  };
}

/** Handles one slash command. `options` is Discord's `data.options` array. */
export async function runCommand(
  name: string,
  options: { name: string; value: unknown }[] = [],
  now = new Date(),
): Promise<CommandReply> {
  if (name === '연금') {
    const group = Number(options.find((o) => o.name === '조')?.value);
    return pensionReply(Number.isInteger(group) && group >= 1 && group <= 5 ? group : null, now);
  }
  if (name === '로또') return lottoReply(now);
  return { content: `알 수 없는 명령어입니다: /${name}` };
}
