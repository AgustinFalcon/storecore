import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ShowcaseDataset, ShowcaseDatasetSchema, DEFAULT_SHOWCASE_DATASET, showcaseCatalogSlug,
  SHOWCASE_PRICE_MAX, SHOWCASE_FEE_MAX_CENTS, SHOWCASE_CHECKOUT_MAX_CENTS } from './showcase-dataset.mjs';
import { MAX_SHOWCASE_DATASET_BYTES, readShowcaseDataset } from './read-showcase-dataset.mjs';

export function defaultWire() {
  return { schemaVersion: ShowcaseDatasetSchema.V1.wire,
    products: DEFAULT_SHOWCASE_DATASET.products.map(product => ({
      sku: product.sku, name: product.name, description: product.description, brand: product.brand,
      category: product.category, image: product.image, price: product.price, stock: product.stock,
    })), home: { ...DEFAULT_SHOWCASE_DATASET.home } };
}

test('slug translator matches backend algorithm and collision vectors', async () => {
  const backend = await readFile(new URL('../../../backend/src/main/kotlin/com/storecore/catalog/infrastructure/CatalogService.kt', import.meta.url), 'utf8');
  assert.ok(backend.includes('value.lowercase().replace(Regex("[^a-z0-9]+"), "-").trim(\'-\').ifBlank { "item" }'));
  for (const [raw, expected] of [
    ['SHOW-TALADRO_18V', 'show-taladro-18v'], ['SHOW-TALADRO-18V', 'show-taladro-18v'],
    ['Tool A', 'tool-a'], ['Tool-A', 'tool-a'], [' Tool__A! ', 'tool-a'],
    ['Électricité', 'lectricit'], ['İstanbul', 'i-stanbul'], ['Kelvin', 'kelvin'],
    ['東京', 'item'], ['---', 'item'], ['', 'item'],
  ]) assert.equal(showcaseCatalogSlug(raw), expected);
  for (const field of ['brand', 'category']) {
    const raw = defaultWire(); raw.products[0][field] = 'Tool A'; raw.products[1][field] = 'Tool-A';
    assert.throws(() => ShowcaseDataset.fromWire(raw), new RegExp(field + 'SlugCollision'));
    raw.products[1][field] = 'TOOL A';
    ShowcaseDataset.fromWire(raw); // backend named() reuses case-insensitive names
  }
  const raw = defaultWire();
  raw.products.push({ ...raw.products[0], sku: 'SHOW-TALADRO_18V' });
  assert.throws(() => ShowcaseDataset.fromWire(raw), /skuSlugCollision/);
});
test('documented template command writes UTF-8 directly and produces an importable dataset', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'showcase-template-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const readme = await readFile(new URL('./README.md', import.meta.url), 'utf8');
  const command = readme.match(/^node --input-type=module -e "(.*)"$/m)?.[1];
  assert.ok(command?.includes("writeFileSync("));
  assert.ok(command.includes("'utf8'"));
  const script = command.replace('./scripts/showcase/showcase-dataset.mjs', new URL('./showcase-dataset.mjs', import.meta.url).href);
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: directory, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const path = join(directory, 'showcase-dataset.json');
  const bytes = await readFile(path);
  assert.equal(bytes.indexOf(0), -1, 'no UTF-16LE NUL bytes');
  assert.ok(bytes.includes(Buffer.from('inalámbrico', 'utf8')));
  assert.equal((await readShowcaseDataset(path)).products.length, 3);
});

test('journey budget derives conservative price bound from three cart units and one fee share', () => {
  assert.equal(SHOWCASE_PRICE_MAX, Number(SHOWCASE_CHECKOUT_MAX_CENTS / 4n / 100n));
  const raw = defaultWire();
  for (const product of raw.products) product.price = SHOWCASE_PRICE_MAX;
  const dataset = ShowcaseDataset.fromWire(raw);
  const maximumFee = String(SHOWCASE_FEE_MAX_CENTS / 100n) + '.' + String(SHOWCASE_FEE_MAX_CENTS % 100n).padStart(2, '0');
  dataset.journey.requireBudget(maximumFee);
  assert.ok((BigInt(dataset.journey.cart.price) + 2n * BigInt(dataset.journey.secondaryCart.price)) * 100n + SHOWCASE_FEE_MAX_CENTS <= SHOWCASE_CHECKOUT_MAX_CENTS);
  assert.throws(() => dataset.journey.requireBudget('250000000000.00'), /journeyBudget/);
  for (const value of [null, -1, '1e2', '1x00', '0.001', Infinity]) assert.throws(() => dataset.journey.requireBudget(value), /deliveryCost/);
  raw.products[0].price++;
  assert.throws(() => ShowcaseDataset.fromWire(raw), /price/);
});


test('schema is closed, Unknown fails translation, and datasets cannot be forged', () => {
  assert.equal(ShowcaseDatasetSchema.fromWire(ShowcaseDatasetSchema.V1.wire), ShowcaseDatasetSchema.V1);
  for (const value of [null, undefined, '1', 2]) assert.equal(ShowcaseDatasetSchema.fromWire(value), ShowcaseDatasetSchema.Unknown);
  assert.throws(() => new ShowcaseDatasetSchema(null, 2), /closed/);
  assert.throws(() => new ShowcaseDataset(null), /fromWire/);
  assert.throws(() => ShowcaseDataset.require(Object.create(ShowcaseDataset.prototype)), /INVALID/);
});

test('translation rebuilds immutable objects, resolves journey by identity and generates an explicit command', () => {
  const raw = defaultWire(); raw.products.reverse();
  const dataset = ShowcaseDataset.fromWire(raw);
  assert.equal(dataset.journey.primary.sku, DEFAULT_SHOWCASE_DATASET.journey.primary.sku);
  assert.equal(dataset.journey.secondaryCart.sku, DEFAULT_SHOWCASE_DATASET.journey.secondaryCart.sku);
  raw.home.title = 'Changed'; raw.products[0].name = 'Changed';
  assert.equal(dataset.home.title, DEFAULT_SHOWCASE_DATASET.home.title);
  assert.notEqual(dataset.products[0].name, 'Changed');
  for (const value of [dataset, dataset.products, dataset.products[0], dataset.home, dataset.journey]) assert.equal(Object.isFrozen(value), true);
  const command = dataset.journey.primary.toCatalogCommand();
  assert.equal(command.variants[0].availableQuantity, dataset.journey.primary.stock);
  assert.deepEqual(command.images, [dataset.journey.primary.image]);
  assert.equal(Object.hasOwn(command, 'schemaVersion'), false);
});

test('dataset rejects malformed shapes, unknown fields, duplicate/missing journey and unsafe scalar values', () => {
  const cases = [
    raw => { raw.schemaVersion = 2; },
    raw => { raw.secret = 'must not log'; },
    raw => { raw.products = null; },
    raw => { raw.products.pop(); },
    raw => { raw.products.push({ ...raw.products[0] }); },
    raw => { raw.products[0].sku = 'SHOW-OTHER'; },
    raw => { raw.products[0].status = 'ACTIVE'; },
    raw => { delete raw.products[0].name; },
    raw => { raw.home.kind = 'HERO'; },
    raw => { raw.home = []; },
    raw => { raw.products[0].name = ' padded '; },
    raw => { raw.products[0].name = 'bad\nname'; },
    raw => { raw.products[0].name = 3; },
    raw => { raw.products[0].price = '189900'; },
    raw => { raw.products[0].price = Infinity; },
    raw => { raw.products[0].price = NaN; },
    raw => { raw.products[0].price = 1.5; },
    raw => { raw.products[0].stock = 1; },
    raw => { raw.products[2].stock = 1; },
    raw => { raw.products[0].sku = 'SHOW-../../secret'; },
    raw => { raw.products[0].sku = 'REAL-ITEM'; },
  ];
  for (const mutate of cases) {
    const raw = defaultWire(); mutate(raw);
    assert.throws(() => ShowcaseDataset.fromWire(raw), /SHOWCASE_DATASET_INVALID/);
  }
});

test('bounds accept edges and reject adjacent invalid values', () => {
  for (const [field, min, max] of [['name', 1, 200], ['description', 0, 5000], ['brand', 1, 100], ['category', 1, 100]]) {
    for (const length of [min, max]) {
      const raw = defaultWire(); raw.products[0][field] = 'a'.repeat(length);
      ShowcaseDataset.fromWire(raw);
    }
    const raw = defaultWire(); raw.products[0][field] = 'a'.repeat(max + 1);
    assert.throws(() => ShowcaseDataset.fromWire(raw), /INVALID/);
    if (min) { raw.products[0][field] = ''; assert.throws(() => ShowcaseDataset.fromWire(raw), /INVALID/); }
  }
  for (const [field, max] of [['title', 200], ['body', 1000]]) {
    const raw = defaultWire(); raw.home[field] = 'a'.repeat(max); ShowcaseDataset.fromWire(raw);
    raw.home[field] += 'a'; assert.throws(() => ShowcaseDataset.fromWire(raw), /INVALID/);
    raw.home[field] = ''; assert.throws(() => ShowcaseDataset.fromWire(raw), /INVALID/);
  }
  for (const [field, min, max] of [['price', 1, SHOWCASE_PRICE_MAX], ['stock', 2, 1000000]]) {
    for (const value of [min, max]) { const raw = defaultWire(); raw.products[0][field] = value; ShowcaseDataset.fromWire(raw); }
    for (const value of [0, max + 1]) { const raw = defaultWire(); raw.products[0][field] = value; assert.throws(() => ShowcaseDataset.fromWire(raw), /INVALID/); }
  }
  const raw = defaultWire();
  while (raw.products.length < 100) raw.products.push({ ...raw.products[0], sku: 'SHOW-EXTRA-' + raw.products.length });
  assert.equal(ShowcaseDataset.fromWire(raw).products.length, 100);
  raw.products.push({ ...raw.products[0], sku: 'SHOW-OVER-LIMIT' });
  assert.throws(() => ShowcaseDataset.fromWire(raw), /INVALID/);
});

test('images are HTTPS allowlisted URLs without authority tricks or active schemes', () => {
  for (const image of ['http://images.unsplash.com/x', 'https://images.unsplash.com.evil.invalid/x',
    'https://user:password@images.unsplash.com/x', 'https://images.unsplash.com:8443/x',
    'https://images.unsplash.com/x#fragment', 'https://127.0.0.1/x', 'data:image/png;base64,x',
    'javascript:alert(1)', '/assets/image.png', 'https://images.unsplash.com/' + 'a'.repeat(2048)]) {
    const raw = defaultWire(); raw.products[0].image = image;
    assert.throws(() => ShowcaseDataset.fromWire(raw), /INVALID/);
  }
  const raw = defaultWire(); raw.products[0].image = 'https://images.unsplash.com/' + 'a'.repeat(2048 - 'https://images.unsplash.com/'.length);
  ShowcaseDataset.fromWire(raw);
});

test('local reader defaults only when absent and enforces UTF-8, JSON, regular file and byte bounds', async t => {
  assert.equal(await readShowcaseDataset(undefined), DEFAULT_SHOWCASE_DATASET);
  const directory = await mkdtemp(join(tmpdir(), 'showcase-dataset-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'fixture.json');
  await writeFile(path, JSON.stringify(defaultWire()));
  assert.equal((await readShowcaseDataset(path)).products.length, 3);
  for (const bytes of [Buffer.from([0xff]), Buffer.from('{broken')]) {
    await writeFile(path, bytes);
    await assert.rejects(readShowcaseDataset(path), /FILE_INVALID_JSON/);
  }
  await writeFile(path, Buffer.alloc(MAX_SHOWCASE_DATASET_BYTES + 1, 32));
  await assert.rejects(readShowcaseDataset(path), /FILE_TOO_LARGE/);
  const json = JSON.stringify(defaultWire());
  await writeFile(path, json + ' '.repeat(MAX_SHOWCASE_DATASET_BYTES - Buffer.byteLength(json)));
  assert.equal((await readShowcaseDataset(path)).products.length, 3);
  await assert.rejects(readShowcaseDataset(directory), /FILE_(INVALID|UNREADABLE)/);
  await assert.rejects(readShowcaseDataset(join(directory, 'missing.json')), /FILE_UNREADABLE/);
  await assert.rejects(readShowcaseDataset(''), /FILE_INVALID/);
});
