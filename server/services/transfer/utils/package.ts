import { createHash } from 'node:crypto';
import { BackupPackageSchema, type BackupPackage } from '../../../../shared/contracts/transfer/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { validateFileType } from '../../media/utils/fileType.js';
import { counts } from './snapshot.js';
import { validateReferences } from './references.js';

export const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

export function parsePackage(bytes: Buffer): { value: BackupPackage; files: Map<string, Buffer>; sourceDigest: string } {
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new AppError(400, 'INVALID_BACKUP', 'Expected an uncompressed UTF-8 Meow workspace backup package.'); }
  const parsed = BackupPackageSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(400, 'INVALID_BACKUP', 'The backup format, schema, limits, or entity fields are not supported.');
  const value = parsed.data;
  validateReferences(value.entities);
  if (JSON.stringify(counts(value.entities)) !== JSON.stringify(value.manifest.counts)) throw new AppError(400, 'INVALID_BACKUP', 'The manifest entity counts do not match its contents.');
  const external = value.entities.music.tracks.flatMap((track) => track.source.kind === 'external' ? [{ trackId: track.id, url: track.source.url, reason: 'externally-hosted' as const }] : []);
  const order = (items: typeof external) => [...items].sort((left, right) => left.trackId.localeCompare(right.trackId));
  if (JSON.stringify(order(external)) !== JSON.stringify(order(value.manifest.unbundledExternalTracks))) throw new AppError(400, 'INVALID_BACKUP', 'The external-stream manifest is inconsistent.');
  const files = new Map<string, Buffer>();
  const metadata = new Map(value.entities.media.assets.map((asset) => [asset.id, asset]));
  if (value.assets.length !== metadata.size) throw new AppError(400, 'INVALID_BACKUP', 'The backup has missing or additional asset files.');
  for (const entry of value.assets) {
    const asset = metadata.get(entry.id);
    if (!asset || files.has(entry.id) || entry.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(entry.base64)) throw new AppError(400, 'INVALID_BACKUP', 'Invalid or duplicate backup asset.');
    const content = Buffer.from(entry.base64, 'base64');
    if (content.toString('base64') !== entry.base64 || content.length !== asset.size || digest(content) !== asset.sha256) throw new AppError(400, 'BACKUP_HASH_MISMATCH', 'Asset size or SHA-256 verification failed.');
    validateFileType(content.subarray(0, 512), asset.mimeType);
    files.set(entry.id, content);
  }
  return { value, files, sourceDigest: digest(bytes) };
}
