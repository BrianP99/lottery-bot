import type { Config } from '@netlify/functions';
import { COMMAND_DEFINITIONS } from '../../src/lottery/commands';

// One-time setup: open https://<site>/api/discord-register-commands?token=<LOTTERY_TRIGGER_TOKEN>
// in a browser to register /연금 and /로또 with Discord. Safe to repeat — it
// replaces the command list rather than adding to it.
// With DISCORD_GUILD_ID set the commands appear in that server immediately;
// without it they're registered globally.
export default async (req: Request) => {
  const expected = Netlify.env.get('LOTTERY_TRIGGER_TOKEN');
  if (!expected || new URL(req.url).searchParams.get('token') !== expected) {
    return new Response('unauthorized', { status: 401 });
  }

  const appId = Netlify.env.get('DISCORD_APPLICATION_ID');
  const botToken = Netlify.env.get('DISCORD_BOT_TOKEN');
  const guildId = Netlify.env.get('DISCORD_GUILD_ID');
  if (!appId || !botToken) {
    return new Response('DISCORD_APPLICATION_ID와 DISCORD_BOT_TOKEN을 설정해주세요.', { status: 500 });
  }

  const url = guildId
    ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
    : `https://discord.com/api/v10/applications/${appId}/commands`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(COMMAND_DEFINITIONS),
  });
  const text = await res.text();
  return new Response(res.ok ? `등록 완료: /연금, /로또\n${text}` : `등록 실패 (HTTP ${res.status})\n${text}`, {
    status: res.ok ? 200 : 502,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};

export const config: Config = {
  path: '/api/discord-register-commands',
};
