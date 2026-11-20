import type { Config } from '@netlify/functions';
import { postToDiscord } from '../../src/discord';
import { buildWeeklyLottery, runWeeklyLottery } from '../../src/lottery/weekly';

// GET  /api/lottery-picks                  → this week's picks as JSON (nothing sent)
// GET  /api/lottery-picks?test=1&token=…   → send this week's message to Discord as a
//      test, saving nothing (no picks, record or issued numbers), so it's safe any day.
//      A GET so it can be opened from a browser.
// POST /api/lottery-picks?token=…          → run the real Monday job now: send and save.
// Both sending modes need LOTTERY_TRIGGER_TOKEN, so a stranger with the URL can't spam the channel.
export default async (req: Request) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const text = (body: string, status = 200) =>
    new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  const params = new URL(req.url).searchParams;
  const authorized = () => {
    const expected = Netlify.env.get('LOTTERY_TRIGGER_TOKEN');
    return Boolean(expected) && params.get('token') === expected;
  };

  try {
    if (params.has('test')) {
      if (!authorized()) return text('비밀번호(token)가 맞지 않아요. 주소 끝의 token= 값을 확인해주세요.', 401);
      const result = await buildWeeklyLottery();
      const payload = result.payload as { content?: string };
      const notify = await postToDiscord({
        ...payload,
        content: '🧪 **테스트 메시지** — 월요일 알림과 같은 모양이에요. 기록에는 저장되지 않아요.',
      });
      return notify.ok
        ? text('✅ 디스코드로 테스트 메시지를 보냈어요. 채널을 확인해보세요.')
        : text(`❌ 디스코드 전송 실패: ${notify.error ?? `HTTP ${notify.status}`}`, 502);
    }
    if (req.method === 'POST') {
      if (!authorized()) return json({ error: 'unauthorized' }, 401);
      const { result, notify } = await runWeeklyLottery();
      return json({ sent: notify.ok, error: notify.error, lotto: result.lotto.games, pension: result.pension.numbers });
    }
    const result = await buildWeeklyLottery();
    return json({
      lottoDrawNo: result.lottoDrawNo,
      lotto: result.lotto,
      pensionDrawNo: result.pensionDrawNo,
      pension: result.pension,
      warnings: result.warnings,
    });
  } catch (err) {
    console.error('lottery-picks failed:', err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
};

export const config: Config = {
  path: '/api/lottery-picks',
};
