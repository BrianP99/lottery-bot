import { createPublicKey, verify } from 'node:crypto';

// Discord signs every interaction with Ed25519 and rejects an endpoint that
// accepts unsigned requests, so this check is required, not optional.
// The application's public key is a raw 32-byte key in hex; Node wants it
// wrapped in an SPKI header.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export function verifyDiscordRequest(publicKeyHex: string, signatureHex: string, timestamp: string, body: string): boolean {
  try {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, 'hex')]),
      format: 'der',
      type: 'spki',
    });
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}
