import { open } from 'node:fs/promises';
import { ShowcaseDataset, DEFAULT_SHOWCASE_DATASET } from './showcase-dataset.mjs';

export const MAX_SHOWCASE_DATASET_BYTES = 1024 * 1024;

export async function readShowcaseDataset(path) {
  if (path === undefined) return DEFAULT_SHOWCASE_DATASET;
  if (typeof path !== 'string' || !path.trim()) throw new Error('SHOWCASE_DATASET_FILE_INVALID');
  let file;
  try {
    file = await open(path, 'r');
    if (!(await file.stat()).isFile()) throw new Error('SHOWCASE_DATASET_FILE_INVALID');
    const bytes = Buffer.alloc(MAX_SHOWCASE_DATASET_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await file.read(bytes, length, bytes.length - length, null);
      if (result.bytesRead === 0) break;
      length += result.bytesRead;
    }
    if (length > MAX_SHOWCASE_DATASET_BYTES) throw new Error('SHOWCASE_DATASET_FILE_TOO_LARGE');
    let raw;
    try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length))); }
    catch { throw new Error('SHOWCASE_DATASET_FILE_INVALID_JSON'); }
    return ShowcaseDataset.fromWire(raw);
  } catch (error) {
    if (error instanceof Error && /^SHOWCASE_DATASET_/.test(error.message)) throw error;
    throw new Error('SHOWCASE_DATASET_FILE_UNREADABLE');
  } finally {
    if (file) await file.close();
  }
}
