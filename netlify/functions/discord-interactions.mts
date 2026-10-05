import type { Config } from '@netlify/functions';
import { runCommand } from '../../src/lottery/commands';
import { verifyDiscordRequest } from '../../src/lottery/discordVerify';

// Discord "Interactions Endpoint URL": receives /연금 and /로또. Set it in the
// Developer Portal to https://<site>/api/discord-interactions.
const PING = 1;
const APPLICATION_COMMAND = 2;
const PONG = 1;
const CHANNEL_MESSAGE_WITH_SOURCE = 4;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const publicKey = Netlify.env.get('DISCORD_PUBLIC_KEY');
  if (!publicKey) return new Response('DISCORD_PUBLIC_KEY is not set', { status: 500 });

  // Verify against the exact bytes Discord signed, before parsing anything.
  const body = await req.text();
  const signature = req.headers.get('x-signature-ed25519') ?? '';
  const timestamp = req.headers.get('x-signature-timestamp') ?? '';
  if (!verifyDiscordRequest(publicKey, signature, timestamp, body)) {
    return new Response('invalid request signature', { status: 401 });
  }

  const interaction = JSON.parse(body);
  if (interaction.type === PING) return json({ type: PONG });
  if (interaction.type !== APPLICATION_COMMAND) return json({ error: 'unsupported interaction' }, 400);

  try {
    const reply = await runCommand(interaction.data?.name, interaction.data?.options);
    return json({ type: CHANNEL_MESSAGE_WITH_SOURCE, data: reply });
  } catch (err) {
    console.error('Discord command failed:', err);
    return json({ type: CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '번호를 만드는 중 오류가 났습니다. 잠시 후 다시 시도해주세요.' } });
  }
};

export const config: Config = {
  path: '/api/discord-interactions',
};
