import type { Config } from '@netlify/functions';
import { runWeeklyLottery } from '../../src/lottery/weekly';

// Every Monday 09:00 KST: this week's 로또 (Sat) and 연금복권720+ (Thu) picks,
// plus how last week's picks did, posted to Discord.
export default async () => {
  try {
    const { result, notify } = await runWeeklyLottery();
    if (!notify.ok) console.error('Weekly lottery Discord post failed:', notify.error);
    console.log(`Weekly lottery: 로또 ${result.lottoDrawNo}회, 연금 ${result.pensionDrawNo}회, sent=${notify.ok}`);
  } catch (err) {
    console.error('Weekly lottery run failed:', err);
  }
};

export const config: Config = {
  // Netlify cron runs in UTC: Monday 00:00 UTC = Monday 09:00 KST.
  schedule: '0 0 * * 1',
};
