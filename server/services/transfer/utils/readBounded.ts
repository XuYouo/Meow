import type { Readable } from 'node:stream';
import { AppError } from '../../../system/errors/AppError.js';

export async function readBounded(stream: Readable, maximum: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  let tooLarge = false;
  for await (const chunk of stream) {
    const bytes: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += bytes.length;
    if (size > maximum) {
      tooLarge = true;
      chunks.length = 0;
      continue;
    }
    chunks.push(bytes);
  }
  if (tooLarge) throw new AppError(413, 'PAYLOAD_TOO_LARGE', `The input exceeds ${maximum} bytes.`);
  if (size === 0) throw new AppError(400, 'EMPTY_TRANSFER', 'The input file is empty.');
  return Buffer.concat(chunks, size);
}
