import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readShowcaseDataset } from './read-showcase-dataset.mjs';

const datasetPath = process.env.STORECORE_SHOWCASE_DATASET_FILE;
const outputDirectory = resolve(process.env.STORECORE_CATALOG_PHOTO_DIRECTORY ?? 'src/assets/showcase/catalog');
const dataset = await readShowcaseDataset(datasetPath);
const sources = [...new Set(dataset.products.flatMap(product => product.images))].sort();
if (sources.length < 24) throw new Error('CATALOG_PHOTO_SOURCE_POOL_INVALID');
await mkdir(outputDirectory, { recursive: true });

async function download(source, index) {
  const remote = new URL(source);
  remote.searchParams.delete('auto');
  remote.searchParams.set('fit', 'crop');
  remote.searchParams.set('w', '900');
  remote.searchParams.set('h', '900');
  remote.searchParams.set('fm', 'jpg');
  remote.searchParams.set('q', '82');
  const response = await fetch(remote, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`CATALOG_PHOTO_DOWNLOAD_FAILED:${response.status}:${source}`);
  const type = response.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) throw new Error(`CATALOG_PHOTO_CONTENT_TYPE_INVALID:${type}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 8_000) throw new Error(`CATALOG_PHOTO_TOO_SMALL:${bytes.length}:${source}`);
  const filename = `ferreteria-${String(index + 1).padStart(3, '0')}.jpg`;
  await writeFile(resolve(outputDirectory, filename), bytes);
  return Object.freeze({ source, localUrl: `/assets/showcase/catalog/${filename}`, bytes: bytes.length });
}

const images = new Array(sources.length);
let cursor = 0;
async function worker() {
  while (cursor < sources.length) {
    const index = cursor++;
    images[index] = await download(sources[index], index);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
const manifest = { schemaVersion: 1, images };
await writeFile(resolve(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ downloaded: images.length, bytes: images.reduce((sum, image) => sum + image.bytes, 0), outputDirectory }, null, 2));
