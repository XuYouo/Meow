import { AppError } from '../../../system/errors/AppError.js';

export function validateFileType(bytes: Buffer, mimeType: string): void {
  const ascii = bytes.toString('ascii');
  const hex = bytes.toString('hex');
  const valid: Record<string, boolean> = {
    'image/png': hex.startsWith('89504e470d0a1a0a'),
    'image/jpeg': hex.startsWith('ffd8ff'),
    'image/gif': ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a'),
    'image/webp': ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP',
    'image/avif': ascii.slice(4, 8) === 'ftyp' && /avif|avis/.test(ascii.slice(8, 32)),
    'audio/mpeg': ascii.startsWith('ID3') || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0),
    'audio/wav': ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE',
    'audio/ogg': ascii.startsWith('OggS'),
    'audio/webm': hex.startsWith('1a45dfa3'),
    'audio/mp4': ascii.slice(4, 8) === 'ftyp',
    'audio/flac': ascii.startsWith('fLaC'),
    'audio/x-flac': ascii.startsWith('fLaC'),
    'application/pdf': ascii.startsWith('%PDF-'),
    'application/octet-stream': true,
    'text/plain': !bytes.includes(0),
  };
  if (!valid[mimeType]) throw new AppError(400, 'INVALID_MEDIA_TYPE', '文件内容与声明的类型不符。');
}
