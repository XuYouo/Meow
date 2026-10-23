import fs from 'fs';
import path from 'path';

const DEFAULT_DATABASE_NAME = 'meownocode.db';
const DEFAULT_DATA_DIR = path.resolve(process.cwd(), 'data');

const resolveDatabasePath = () => {
  if (process.env.SQLITE_DB_PATH && process.env.SQLITE_DB_PATH.trim()) {
    return path.resolve(process.env.SQLITE_DB_PATH.trim());
  }

  if (process.env.SQLITE_DATA_DIR && process.env.SQLITE_DATA_DIR.trim()) {
    return path.resolve(process.env.SQLITE_DATA_DIR.trim(), DEFAULT_DATABASE_NAME);
  }

  return path.resolve(DEFAULT_DATA_DIR, DEFAULT_DATABASE_NAME);
};

const ensureDirectory = (targetPath) => {
  const directory = path.dirname(targetPath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
};

const parseCorsOrigins = () => {
  const raw = process.env.CORS_ALLOW_ORIGIN;
  if (!raw || !raw.trim()) {
    return ['*'];
  }

  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return values.length > 0 ? values : ['*'];
};

const sqlitePath = resolveDatabasePath();
ensureDirectory(sqlitePath);

export const config = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT) || 3000,
  password: process.env.APP_PASSWORD ? process.env.APP_PASSWORD.trim() : '',
  initToken: process.env.INIT_TOKEN ? process.env.INIT_TOKEN.trim() : '',
  sqlitePath,
  corsOrigins: parseCorsOrigins(),
  serveStatic: process.env.SERVE_STATIC !== 'false',
};
