import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { healthContract } from '../shared/contracts/system/health.js';
import { checkDatabaseReady } from './system/tables/schema/table.js';
import type { Migration } from './system/database/Migration.js';
import { openDatabase } from './system/database/openDatabase.js';
import { readConfig, type ServerConfig } from './system/config.js';
import { RouteRegistry } from './system/http/RouteRegistry.js';
import { errorHandler, requestSecurity, type ErrorDiagnostic } from './system/http/middleware.js';
import { AppError } from './system/errors/AppError.js';
import { createAsyncMutex, type AsyncMutex } from './system/concurrency/AsyncMutex.js';
import { credentialsMigration } from './services/identity/tables/credentials/migration.js';
import { sessionsMigration } from './services/identity/tables/sessions/migration.js';
import { plan as initializeIdentity } from './services/identity/api/InitializeIdentityAPIMessage.js';
import { createIdentity } from './services/identity/routes/index.js';

export type ApplicationRuntime = ReturnType<typeof openDatabase> & {
  readonly config: Omit<ServerConfig, 'ownerPassword'>;
  readonly now: () => string;
  readonly filePublication: AsyncMutex;
};

export interface ApplicationOptions {
  readonly config?: ServerConfig;
  readonly migrations?: readonly Migration[];
  readonly now?: () => string;
  readonly registerDomains?: (registry: RouteRegistry, runtime: ApplicationRuntime) => void;
  readonly logError?: (diagnostic: ErrorDiagnostic) => void;
}

/** Creating an application never listens; all filesystem access is explicit here. */
export function createApplication(options: ApplicationOptions = {}) {
  const config = options.config ?? readConfig();
  const now = options.now ?? (() => new Date().toISOString());
  const storage = openDatabase(config.dataDir, [credentialsMigration, sessionsMigration, ...(options.migrations ?? [])], now);
  try {
    const { ownerPassword, ...safeConfig } = config;
    storage.unitOfWork.run(() => initializeIdentity(ownerPassword, { db: storage.db, now }));
    const runtime: ApplicationRuntime = { ...storage, config: safeConfig, now, filePublication: createAsyncMutex() };
    const app = express();
    app.disable('x-powered-by');
    if (config.trustProxy) app.set('trust proxy', 'loopback');
    app.use(requestSecurity(safeConfig));
    app.use(express.json({ limit: '1mb', strict: true }));
    const identity = createIdentity({ db: storage.db, config: safeConfig, enabled: Boolean(ownerPassword), instanceId: storage.instanceId, now });
    const registry = new RouteRegistry(app, storage.unitOfWork, identity.resolvePrincipal);
    identity.register(registry);
    registry.register({
      contract: healthContract,
      access: 'public',
      handler: () => {
        checkDatabaseReady(storage.db);
        return { status: 'ready' as const, instanceId: storage.instanceId, schemaVersion: 1 as const };
      },
    });
    options.registerDomains?.(registry, runtime);
    app.use('/api', (_request, _response, next) => next(new AppError(404, 'NOT_FOUND', 'API endpoint not found.')));
    if (config.staticDir && existsSync(path.join(config.staticDir, 'index.html'))) {
      app.use(express.static(config.staticDir, { index: false }));
      app.get('*', (_request, response) => response.sendFile(path.join(config.staticDir || '', 'index.html')));
    }
    app.use((_request, _response, next) => next(new AppError(404, 'NOT_FOUND', 'Resource not found.')));
    app.use(errorHandler(options.logError ?? ((diagnostic) => process.stderr.write(`${JSON.stringify(diagnostic)}\n`))));
    return { app, runtime, registry, close: () => storage.db.close() };
  } catch (error) {
    storage.db.close();
    throw error;
  }
}
