import path from 'node:path';
import { z } from 'zod';

const portSchema = z.coerce.number().int().min(0).max(65535);

export interface ServerConfig {
  readonly dataDir: string;
  readonly host: string;
  readonly port: number;
  readonly production: boolean;
  readonly publicOrigin?: string;
  readonly ownerPassword?: string;
  readonly sessionTtlMs: number;
  readonly staticDir?: string;
  readonly trustProxy: boolean;
}

export function readConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const production = environment.NODE_ENV === 'production';
  const publicOrigin = environment.MEOW_PUBLIC_ORIGIN;
  if (publicOrigin && new URL(publicOrigin).origin !== publicOrigin) {
    throw new Error('MEOW_PUBLIC_ORIGIN must be an origin without a path.');
  }
  if (production && publicOrigin && !publicOrigin.startsWith('https://')) {
    throw new Error('Production MEOW_PUBLIC_ORIGIN must use HTTPS.');
  }
  const ownerPassword = environment.MEOW_OWNER_PASSWORD;
  if (ownerPassword !== undefined && (ownerPassword.length < 12 || ownerPassword.length > 1024)) {
    throw new Error('MEOW_OWNER_PASSWORD must contain 12 to 1024 characters.');
  }
  return {
    dataDir: path.resolve(environment.MEOW_DATA_DIR || 'data-v2'),
    host: environment.MEOW_HOST || '127.0.0.1',
    port: portSchema.parse(environment.MEOW_PORT || 3000),
    production,
    ...(publicOrigin ? { publicOrigin } : {}),
    ...(ownerPassword ? { ownerPassword } : {}),
    sessionTtlMs: z.coerce.number().int().min(60_000).max(30 * 24 * 60 * 60 * 1000).parse(environment.MEOW_SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000),
    staticDir: path.resolve(environment.MEOW_STATIC_DIR || 'build'),
    trustProxy: environment.MEOW_TRUST_PROXY === 'true',
  };
}
