// Posts to the channel behind DISCORD_WEBHOOK_URL. Netlify Functions expose env
// vars via the global `Netlify.env`, plain Node (local scripts) via process.env.
// Never hardcode the URL: anyone who has it can post to the channel.
function getWebhookUrl(): string | undefined {
  const netlifyEnv = (globalThis as any).Netlify?.env;
  return netlifyEnv?.get?.('DISCORD_WEBHOOK_URL') || process.env.DISCORD_WEBHOOK_URL;
}

export interface DiscordNotifyResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/** Never throws — the caller logs the result. */
export async function postToDiscord(payload: unknown): Promise<DiscordNotifyResult> {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return { ok: false, error: 'DISCORD_WEBHOOK_URL이 설정되지 않았습니다.' };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    // fetch() doesn't throw on 4xx/5xx, so a deleted webhook would otherwise look like success.
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`Discord webhook responded ${res.status}: ${text}`);
      return { ok: false, status: res.status, error: text || `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Discord notification failed:', err);
    return { ok: false, error: message };
  }
}
