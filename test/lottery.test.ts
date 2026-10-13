import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { generateLottoPicks, generatePensionPicks, lottoRank, pensionRank } from '../src/lottery/analysis';
import { COMMAND_DEFINITIONS, runCommand } from '../src/lottery/commands';
import { parseLottoDraw, parsePensionDraw, type LottoDraw, type PensionDraw } from '../src/lottery/dhlottery';
import { verifyDiscordRequest } from '../src/lottery/discordVerify';
import { upcomingDraw } from '../src/lottery/history';
import lottoSeed from '../src/lottery/data/lottoSeed.json';
import pensionSeed from '../src/lottery/data/pensionSeed.json';

// Netlify Blobs isn't available outside Netlify; the store helpers log and
// carry on, so these run against the bundled seed only.
const lotto = lottoSeed as LottoDraw[];
const pension = pensionSeed as PensionDraw[];

test('upcoming draw numbers and dates', () => {
  const monday = new Date('2026-10-05T00:00:00Z'); // 2026-10-05 09:00 KST
  assert.deepEqual(upcomingDraw('lotto', monday), { drawNo: 1245, date: '2026-10-10' });
  assert.deepEqual(upcomingDraw('pension', monday), { drawNo: 336, date: '2026-10-08' });
  assert.equal(upcomingDraw('lotto', new Date('2026-10-03T01:00:00Z')).drawNo, 1244); // draw day itself
});

test('로또 등위', () => {
  const d = { drawNo: 1, date: '', numbers: [1, 2, 3, 4, 5, 6], bonus: 7 };
  assert.equal(lottoRank([1, 2, 3, 4, 5, 6], d), 1);
  assert.equal(lottoRank([1, 2, 3, 4, 5, 7], d), 2);
  assert.equal(lottoRank([1, 2, 3, 4, 5, 8], d), 3);
  assert.equal(lottoRank([1, 2, 3, 4, 9, 8], d), 4);
  assert.equal(lottoRank([1, 2, 3, 10, 9, 8], d), 5);
  assert.equal(lottoRank([1, 2, 11, 10, 9, 8], d), null);
});

test('연금 등위 — only the highest one counts', () => {
  const d = { drawNo: 1, date: '', group: 4, number: '259311', bonus: '799723' };
  assert.equal(pensionRank(4, '259311', d), '1등');
  assert.equal(pensionRank(1, '259311', d), '2등');
  assert.equal(pensionRank(1, '799723', d), '보너스');
  assert.equal(pensionRank(1, '159311', d), '3등');
  assert.equal(pensionRank(1, '000001', d), '7등');
  assert.equal(pensionRank(1, '000000', d), null);
  assert.equal(pensionRank(1, '799721', { ...d, number: '000001', bonus: '799721' }), '보너스');
});

test('parses the official JSON rows', () => {
  assert.deepEqual(
    parseLottoDraw({ ltEpsd: 1244, ltRflYmd: '20261003', tm1WnNo: 38, tm2WnNo: 1, tm3WnNo: 13, tm4WnNo: 18, tm5WnNo: 26, tm6WnNo: 34, bnsWnNo: 25 }),
    { drawNo: 1244, date: '2026-10-03', numbers: [1, 13, 18, 26, 34, 38], bonus: 25 },
  );
  assert.equal(parseLottoDraw({ ltEpsd: 1, ltRflYmd: '20261003', tm1WnNo: 1, tm2WnNo: 1, tm3WnNo: 13, tm4WnNo: 18, tm5WnNo: 26, tm6WnNo: 34, bnsWnNo: 25 }), null);
  assert.deepEqual(
    parsePensionDraw({ psltEpsd: 335, psltRflYmd: '20261001', wnBndNo: '4', wnRnkVl: '259311', bnsRnkVl: '799723' }),
    { drawNo: 335, date: '2026-10-01', group: 4, number: '259311', bonus: '799723' },
  );
});

test('로또 picks: five valid, deterministic games; a new salt gives new games', () => {
  const a = generateLottoPicks(lotto, 1245);
  assert.deepEqual(a.games, generateLottoPicks(lotto, 1245).games);
  assert.equal(a.games.length, 5);
  for (const g of a.games) {
    assert.equal(new Set(g).size, 6);
    assert.ok(g.every((n) => n >= 1 && n <= 45));
  }
  assert.notDeepEqual(a.games, generateLottoPicks(lotto, 1245, 5, 1).games);
});

test('연금 picks: distinct candidates, never one already handed out', () => {
  const a = generatePensionPicks(pension, 336, 3);
  assert.equal(new Set(a.numbers).size, 3);
  assert.ok(a.numbers.every((n) => /^\d{6}$/.test(n)));
  const b = generatePensionPicks(pension, 336, 3, a.numbers, 1);
  assert.ok(b.numbers.every((n) => !a.numbers.includes(n)));
});

test('commands roll over to the next draw once sales close', async () => {
  const title = async (name: string, at: string) => ((await runCommand(name, [], new Date(at))) as any).embeds[0].title as string;
  assert.match(await title('연금', '2026-10-08T01:00:00Z'), /제336회/); // 목 10:00 KST
  assert.match(await title('연금', '2026-10-08T09:00:00Z'), /제337회/); // 목 18:00 KST
  assert.match(await title('로또', '2026-10-10T10:00:00Z'), /제1245회/); // 토 19:00 KST
  assert.match(await title('로또', '2026-10-10T12:00:00Z'), /제1246회/); // 토 21:00 KST
  const oneGroup = (await runCommand('연금', [{ name: '조', value: 3 }])) as any;
  assert.match(oneGroup.embeds[0].description, /3조만 새 번호로/);
  assert.ok(COMMAND_DEFINITIONS.every((c) => c.description.length <= 100));
});

test('Discord signature verification', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const rawPublicKey = publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
  const body = '{"type":1}';
  const timestamp = '1700000000';
  const signature = sign(null, Buffer.from(timestamp + body), privateKey).toString('hex');
  assert.equal(verifyDiscordRequest(rawPublicKey, signature, timestamp, body), true);
  assert.equal(verifyDiscordRequest(rawPublicKey, signature, timestamp, body + ' '), false);
  assert.equal(verifyDiscordRequest(rawPublicKey, 'zz', timestamp, body), false);
});
