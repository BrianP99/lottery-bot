import type { Config } from '@netlify/functions';
import { buildWeeklyLottery, runWeeklyLottery } from '../../src/lottery/weekly';

// GET  /api/lottery-picks          → this week's picks as JSON (nothing sent)
// POST /api/lottery-picks?token=…  → run the Monday job now and post to Discord.
//      Needs LOTTERY_TRIGGER_TOKEN, so a stranger with the URL can't spam the channel.
export default async (req: Request) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  try {
    if (req.method === 'POST') {
      const expected = Netlify.env.get('LOTTERY_TRIGGER_TOKEN');
      const token = new URL(req.url).searchParams.get('token');
      if (!expected || token !== expected) return json({ error: 'unauthorized' }, 401);
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
