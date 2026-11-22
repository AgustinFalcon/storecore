import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HttpSession } from './load-storecore-showcase.mjs';
import { readShowcaseDataset } from './read-showcase-dataset.mjs';

const catalogExpansionDecisionToken = Symbol('CatalogExpansionDecision');
const catalogProductStatusToken = Symbol('CatalogProductStatus');

export class CatalogExpansionDecision {
  static Create = new CatalogExpansionDecision(catalogExpansionDecisionToken, 'CREATE');
  static Reconcile = new CatalogExpansionDecision(catalogExpansionDecisionToken, 'RECONCILE');
  static Preserve = new CatalogExpansionDecision(catalogExpansionDecisionToken, 'PRESERVE');
  static Unknown = new CatalogExpansionDecision(catalogExpansionDecisionToken, 'UNKNOWN');
  static values = Object.freeze([this.Create, this.Reconcile, this.Preserve]);
  constructor(token, wire) { if (token !== catalogExpansionDecisionToken) throw new TypeError('CATALOG_EXPANSION_DECISION_CONSTRUCTOR'); this.wire = wire; Object.freeze(this); }
  static fromWire(raw) { return this.values.find(value => value.wire === raw) ?? this.Unknown; }
}

export class CatalogProductStatus {
  static Active = new CatalogProductStatus(catalogProductStatusToken, 'ACTIVE');
  static Unknown = new CatalogProductStatus(catalogProductStatusToken, 'UNKNOWN');
  static values = Object.freeze([this.Active]);
  constructor(token, wire) { if (token !== catalogProductStatusToken) throw new TypeError('CATALOG_PRODUCT_STATUS_CONSTRUCTOR'); this.wire = wire; Object.freeze(this); }
  static fromWire(raw) { return this.values.find(value => value.wire === raw) ?? this.Unknown; }
}

const matrix = Object.freeze([
  ['Herramientas eléctricas', ['Lijadora orbital 300W', 'Sierra caladora 650W', 'Pistola de calor 2000W', 'Fresadora compacta 1200W', 'Cepillo eléctrico 900W', 'Pulidora profesional 1400W']],
  ['Herramientas manuales', ['Alicate de corte diagonal 7 pulgadas', 'Morsa de banco 100 mm', 'Sargento rápido 300 mm', 'Juego de tubos 46 piezas', 'Formón profesional 25 mm', 'Serrucho de costilla 350 mm']],
  ['Corte y abrasivos', ['Disco diamantado turbo 115 mm', 'Disco de desbaste 180 mm x 5', 'Lija al agua grano 400 x 20', 'Hoja sable bimetálica x 5', 'Cepillo copa trenzado 100 mm', 'Mecha escalonada HSS 4–32 mm']],
  ['Fijaciones', ['Tornillo autoperforante 8 x 1 x 200', 'Bulón hexagonal M10 x 60 x 25', 'Tuerca autofrenante M8 x 100', 'Remache aluminio 4 x 12 x 100', 'Anclaje químico 300 ml', 'Abrazadera metálica 16–27 mm x 20']],
  ['Medición y precisión', ['Nivel láser verde 12 líneas', 'Telémetro láser 60 m', 'Micrómetro exterior 0–25 mm', 'Detector digital de materiales', 'Regla de acero inoxidable 600 mm', 'Goniómetro digital magnético']],
  ['Seguridad industrial', ['Arnés anticaídas de cinco puntos', 'Protector facial rebatible', 'Respirador media cara con filtros', 'Botín de seguridad punta composite', 'Chaleco reflectivo alta visibilidad', 'Kit de bloqueo eléctrico LOTO']],
  ['Pintura y terminación', ['Pistola de pintar HVLP 600W', 'Rodillo antigota 22 cm x 3', 'Espátula flexible inoxidable x 4', 'Bandeja profesional con rejilla', 'Cinta de enmascarar 36 mm x 6', 'Mezclador helicoidal para pintura']],
  ['Electricidad', ['Multímetro digital true RMS', 'Pinza amperométrica 600A', 'Buscapolo inductivo sin contacto', 'Prolongador reforzado 25 m', 'Tablero portátil con térmica', 'Juego terminales eléctricos x 300']],
  ['Jardín y exterior', ['Tijera de podar con crique', 'Manguera reforzada 30 m', 'Aspersor metálico sectorial', 'Hacha de mano 800 g', 'Serrucho de poda curvo 330 mm', 'Enrollador portátil para manguera']],
  ['Almacenamiento y obra', ['Caja de herramientas 24 pulgadas', 'Organizador modular 18 gavetas', 'Bolso portaherramientas reforzado', 'Carro taller metálico 3 bandejas', 'Caballete plegable reforzado x 2', 'Escalera aluminio doméstica 6 escalones']],
  ['Accesorios y consumibles', ['Set puntas impacto 40 piezas', 'Brocas para madera 8 piezas', 'Mechas widia SDS x 7', 'Kit discos de corte y flap x 20', 'Batería universal 18V 4Ah', 'Cargador rápido universal 18V']],
  ['Construcción y jardín', ['Carretilla reforzada 90 litros', 'Pala ancha mango de fibra', 'Maza octogonal 3 kg', 'Cortaperno profesional 24 pulgadas', 'Cuchara albañil forjada 8 pulgadas', 'Fratacho plástico con goma 30 cm']],
]);
const brands = Object.freeze(['Falcon Pro', 'ObraMax', 'Taller Uno', 'Punto Firme', 'Acerix', 'Medix', 'SeguroLab', 'Electra', 'Jardín Sur']);

export function buildCatalogExpansionFixtures(sourceProducts, imagePoolOverride = null) {
  const images = Array.isArray(imagePoolOverride) ? imagePoolOverride
    : imagePoolOverride?.all ?? [...new Set(sourceProducts.flatMap(product => product.images))];
  if (images.length < 12) throw new Error('CATALOG_EXPANSION_IMAGE_POOL_INVALID');
  const rows = []; let ordinal = 0;
  for (const [category, names] of matrix) for (const name of names) {
    ordinal += 1;
    const categoryImages = imagePoolOverride?.sourceToLocal
      ? [...new Set(sourceProducts.filter(product => product.category === category).flatMap(product => product.images)
        .map(image => imagePoolOverride.sourceToLocal[image]).filter(Boolean))]
      : [];
    const pool = categoryImages.length >= 4 ? categoryImages : images;
    const selected = Array.from({ length: 4 }, (_, offset) => pool[(ordinal * 7 + offset) % pool.length]);
    if (new Set(selected).size !== 4) throw new Error('CATALOG_EXPANSION_IMAGE_SELECTION_INVALID');
    rows.push(Object.freeze({
      sku: `SHOW-PLUS-${String(ordinal).padStart(3, '0')}`,
      name, category, brand: brands[(ordinal - 1) % brands.length], images: Object.freeze(selected),
      description: `${name} para uso profesional y doméstico intensivo. Presentación seleccionada para taller, mantenimiento, obra y ferretería, con stock local visible y ficha completa.`,
      price: 7900 + ordinal * 2375, stock: 8 + (ordinal * 7) % 73,
    }));
  }
  if (rows.length !== 72 || new Set(rows.map(row => row.name.toLowerCase())).size !== 72) throw new Error('CATALOG_EXPANSION_FIXTURE_INVALID');
  return Object.freeze(rows);
}

class ExpansionConfig {
  constructor(raw) {
    const base = new URL(raw.baseUrl); const origin = new URL(raw.origin); const hosts = new Set(['localhost', '127.0.0.1', '[::1]']);
    if (base.protocol !== 'http:' || !hosts.has(base.hostname) || !['http:', 'https:'].includes(origin.protocol) || !hosts.has(origin.hostname)) throw new Error('CATALOG_EXPANSION_LOOPBACK_REQUIRED');
    if (!raw.adminEmail?.trim() || !raw.adminPassword?.trim() || !raw.receiptPath?.trim()) throw new Error('CATALOG_EXPANSION_CONFIG_REQUIRED');
    this.baseUrl = base.href.replace(/\/$/, ''); this.origin = origin.origin; this.adminEmail = raw.adminEmail.trim();
    this.adminPassword = raw.adminPassword.trim(); this.receiptPath = resolve(raw.receiptPath); Object.freeze(this);
  }
  static fromEnvironment(env = process.env) { return new ExpansionConfig({
    baseUrl: env.STORECORE_EXPANSION_BASE_URL ?? env.STORECORE_SHOWCASE_BASE_URL,
    origin: env.STORECORE_EXPANSION_ORIGIN ?? env.STORECORE_SHOWCASE_ORIGIN,
    adminEmail: env.STORECORE_EXPANSION_ADMIN_EMAIL ?? env.STORECORE_SHOWCASE_ADMIN_EMAIL,
    adminPassword: env.STORECORE_EXPANSION_ADMIN_PASSWORD ?? env.STORECORE_SHOWCASE_ADMIN_PASSWORD,
    receiptPath: env.STORECORE_EXPANSION_RECEIPT_PATH,
  }); }
}

function command(row, existing = null) {
  const existingVariant = existing?.variants?.length === 1 ? existing.variants[0] : null;
  const variant = existingVariant
    ? { id: existingVariant.id, sku: row.sku, name: row.name, active: true }
    : { sku: row.sku, name: row.name, availableQuantity: row.stock, stockAdjustmentReason: 'LOCAL_SHOWCASE_RECONCILIATION' };
  return { sku: row.sku, name: row.name, description: row.description, brand: row.brand, category: row.category,
    images: [...row.images], price: { base: row.price }, active: true, variants: [variant] };
}
function matches(actual, expected) {
  const variant = actual?.variants?.length === 1 ? actual.variants[0] : null;
  return !(actual?.sku !== expected.sku || actual.name !== expected.name || actual.description !== expected.description || actual.brand !== expected.brand
    || actual.category !== expected.category || CatalogProductStatus.fromWire(actual.status) !== CatalogProductStatus.Active || actual.active !== true || actual.price?.base !== expected.price
    || variant?.sku !== expected.sku || variant.name !== expected.name || variant.active !== true || variant.inventory?.onHand !== expected.stock
    || !Array.isArray(actual.media) || actual.media.length !== 4 || actual.media.some((media, index) => media.url !== expected.images[index] || media.sortOrder !== index || media.primary !== (index === 0)));
}
function verify(actual, expected) {
  if (!matches(actual, expected)) throw new Error(`CATALOG_EXPANSION_DRIFT:${expected.sku}`);
}
async function readLocalizedImages(path) {
  if (!path) return null;
  const manifest = JSON.parse(await readFile(resolve(path), 'utf8'));
  const images = manifest.images?.map(image => image.localUrl);
  if (!Array.isArray(images) || images.length < 12 || images.some(image => typeof image !== 'string' || !image.startsWith('/assets/'))) {
    throw new Error('CATALOG_EXPANSION_LOCAL_IMAGE_MANIFEST_INVALID');
  }
  return { all: images, sourceToLocal: Object.fromEntries(manifest.images.map(image => [image.source, image.localUrl])) };
}

async function run() {
  const config = ExpansionConfig.fromEnvironment(); const raw = await readShowcaseDataset(process.env.STORECORE_SHOWCASE_DATASET_FILE);
  const localImages = await readLocalizedImages(process.env.STORECORE_EXPANSION_IMAGE_MANIFEST);
  const rows = buildCatalogExpansionFixtures(raw.products, localImages); const admin = new HttpSession(config);
  await admin.request('/api/v1/internal/auth/login', { method: 'POST', body: { email: config.adminEmail, password: config.adminPassword } });
  let created = 0; let reconciled = 0; let preserved = 0;
  for (const row of rows) {
    let actual = await admin.request(`/api/v1/user/catalog/products/${row.sku}`, { expected: [200, 404] });
    const decision = actual === null ? CatalogExpansionDecision.Create : matches(actual, row) ? CatalogExpansionDecision.Preserve : CatalogExpansionDecision.Reconcile;
    if (CatalogExpansionDecision.fromWire(decision.wire) === CatalogExpansionDecision.Unknown) throw new Error('CATALOG_EXPANSION_DECISION_INVALID');
    if (decision !== CatalogExpansionDecision.Preserve) {
      actual = await admin.request(`/api/v1/user/catalog/products/${row.sku}`, { method: 'PUT', csrf: true, body: command(row, actual) });
      if (decision === CatalogExpansionDecision.Create) created += 1; else reconciled += 1;
    } else preserved += 1;
    verify(actual, row);
  }
  const content = { schemaVersion: 1, namespace: 'storecore-ferreteria-expansion-v1', products: rows.map(row => ({ sku: row.sku, name: row.name, category: row.category, images: row.images.length, stock: row.stock, price: row.price })) };
  const receipt = { ...content, created, reconciled, preserved, digest: createHash('sha256').update(JSON.stringify(content)).digest('hex') };
  await mkdir(dirname(config.receiptPath), { recursive: true }); await writeFile(config.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(receipt, null, 2));
}
const invokedAs = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedAs === import.meta.url) run().catch(error => { console.error(`[catalog-expansion] failed: ${error.message}`); process.exitCode = 1; });
