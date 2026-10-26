import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export function hashPassword(password: string): string {
  const salt = randomBytes(32);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [algorithm, saltHex, hashHex] = encoded.split(':');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex || !/^[a-f0-9]{64}$/.test(saltHex) || !/^[a-f0-9]{128}$/.test(hashHex)) return false;
  const expected = Buffer.from(hashHex, 'hex');
  return timingSafeEqual(scryptSync(password, Buffer.from(saltHex, 'hex'), 64), expected);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
