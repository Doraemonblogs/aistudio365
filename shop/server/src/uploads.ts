import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from './errors.js';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

type ImageType = 'png' | 'jpg' | 'gif' | 'webp';

/** Image type from the file's first bytes; the name and declared type are not trusted. */
export function detectImageType(buffer: Buffer): ImageType | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('latin1'))) return 'gif';
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

/** Stores an uploaded image under a random name and returns its public path. */
export async function saveImage(uploadsDir: string, buffer: Buffer): Promise<string> {
  const type = detectImageType(buffer);
  if (!type) throw new AppError(400, '只支持 JPG、PNG、GIF、WebP 图片');
  const name = `${randomUUID()}.${type}`;
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, name), buffer);
  return `/uploads/${name}`;
}

/** Image fields hold '' or a file in our uploads folder, never an outside URL. */
export function isUploadPath(value: string): boolean {
  return value === '' || /^\/uploads\/[A-Za-z0-9._-]+$/.test(value);
}
