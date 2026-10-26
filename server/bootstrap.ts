import { createApplication, type ApplicationOptions } from './app.js';
import { memosMigrations } from './services/memos/tables/migrations.js';
import { registerMemosRoutes } from './services/memos/routes/index.js';
import { mediaAssetsMigration } from './services/media/tables/assets/migration.js';
import { mediaReferencesMigration } from './services/media/tables/references/migration.js';
import { registerMediaRoutes } from './services/media/routes/index.js';
import { plan as setMediaReferences } from './services/media/api/SetMediaReferencesAPIMessage.js';
import { plan as validateMediaReferences } from './services/media/api/ValidateMediaReferencesAPIMessage.js';
import { preferencesMigrations } from './services/preferences/tables/preferences/migration.js';
import { registerPreferencesRoutes } from './services/preferences/routes/index.js';
import { canvasMigrations } from './services/canvas/tables/migrations.js';
import { registerCanvasRoutes } from './services/canvas/routes/index.js';
import { plan as removeCanvasReferences } from './services/canvas/api/RemoveMemoReferencesAPIMessage.js';
import { reviewMigrations } from './services/review/tables/results/migration.js';
import { registerReviewRoutes } from './services/review/routes/index.js';
import { plan as removeReviewReferences } from './services/review/api/RemoveMemoReferencesAPIMessage.js';
import { musicMigrations } from './services/music/tables/tracks/migration.js';
import { registerMusicRoutes } from './services/music/routes/index.js';
import { registerIntegrationRoutes } from './services/integrations/routes/index.js';
import { readIntegrationConfig, type IntegrationConfig } from './services/integrations/utils/IntegrationDependencies.js';
import type { ExternalRequest } from './system/network/SafeHttp.js';
import { transferMigrations } from './services/transfer/tables/batches/migration.js';
import { registerTransferRoutes } from './services/transfer/routes/index.js';
import type { TransferDependencies } from './services/transfer/utils/TransferDependencies.js';

export interface WorkspaceApplicationOptions extends Omit<ApplicationOptions, 'migrations' | 'registerDomains'> {
  readonly integrationConfig?: IntegrationConfig;
  readonly externalRequest?: ExternalRequest;
  readonly transferFault?: TransferDependencies['fault'];
}

/** The composition root owns cross-domain workflows; system never imports domains. */
export function createWorkspaceApplication(options: WorkspaceApplicationOptions = {}) {
  const { integrationConfig = readIntegrationConfig(), externalRequest, transferFault, ...applicationOptions } = options;
  return createApplication({
    ...applicationOptions,
    migrations: [...memosMigrations, mediaAssetsMigration, mediaReferencesMigration, ...preferencesMigrations, ...canvasMigrations, ...reviewMigrations, ...musicMigrations, ...transferMigrations],
    registerDomains(registry, runtime) {
      registerMemosRoutes(registry, runtime, { onMemoChanged(before, after, principal) {
        const memo = after ?? before;
        if (!memo) return;
        validateMediaReferences(after?.attachments ?? [], runtime);
        setMediaReferences({ resourceType: 'memo', resourceId: memo.id, mediaIds: after?.attachments.map((attachment) => attachment.mediaId) ?? [], isPublic: after?.isPublic ?? false }, runtime);
        if (!after) {
          removeCanvasReferences({ memoId: memo.id }, runtime);
          removeReviewReferences({ memoId: memo.id }, { ...runtime, principal });
        }
      } });
      registerMediaRoutes(registry, runtime);
      registerPreferencesRoutes(registry, runtime, { onChanged(_before, after) {
        const mediaIds = [after.avatarMediaId, after.background.mediaId].filter((id): id is string => id !== null);
        validateMediaReferences(mediaIds.map((mediaId) => ({ mediaId, kind: 'image' })), runtime);
        setMediaReferences({ resourceType: 'preferences', resourceId: 'workspace', mediaIds, isPublic: true }, runtime);
      } });
      registerCanvasRoutes(registry, runtime, { onCanvasChanged(_before, after) {
        const mediaIds = after.document.shapes.filter((shape) => shape.type === 'image').map((shape) => shape.mediaId);
        validateMediaReferences(mediaIds.map((mediaId) => ({ mediaId, kind: 'image' })), runtime);
        setMediaReferences({ resourceType: 'canvas', resourceId: 'workspace', mediaIds, isPublic: false }, runtime);
      } });
      registerReviewRoutes(registry, runtime);
      registerMusicRoutes(registry, runtime, { onChanged(before, after) {
        const track = after ?? before;
        if (!track) return;
        const audioId = after?.source.kind === 'media' ? after.source.mediaId : null;
        const mediaIds = [audioId, after?.coverMediaId, after?.lyricsMediaId].filter((id): id is string => typeof id === 'string');
        validateMediaReferences([
          ...(audioId ? [{ mediaId: audioId, kind: 'audio' as const }] : []),
          ...(after?.coverMediaId ? [{ mediaId: after.coverMediaId, kind: 'image' as const }] : []),
          ...(after?.lyricsMediaId ? [{ mediaId: after.lyricsMediaId, kind: 'file' as const }] : []),
        ], runtime);
        setMediaReferences({ resourceType: 'music', resourceId: track.id, mediaIds, isPublic: false }, runtime);
      } });
      registerIntegrationRoutes(registry, runtime, integrationConfig, externalRequest);
      registerTransferRoutes(registry, runtime, { fault: transferFault });
    },
  });
}
