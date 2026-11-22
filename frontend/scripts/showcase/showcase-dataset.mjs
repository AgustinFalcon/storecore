const SCHEMA_TOKEN = Symbol('ShowcaseDatasetSchema');
export class ShowcaseDatasetSchema {
  static V1 = new ShowcaseDatasetSchema(SCHEMA_TOKEN, 1);
  static V2 = new ShowcaseDatasetSchema(SCHEMA_TOKEN, 2);
  static Unknown = new ShowcaseDatasetSchema(SCHEMA_TOKEN, null);
  constructor(token, wire) {
    if (token !== SCHEMA_TOKEN) throw new TypeError('ShowcaseDatasetSchema is closed');
    this.wire = wire;
    Object.freeze(this);
  }
  static fromWire(raw) {
    if (raw === this.V1.wire) return this.V1;
    if (raw === this.V2.wire) return this.V2;
    return this.Unknown;
  }
}
Object.freeze(ShowcaseDatasetSchema);

const DATASET_TOKEN = Symbol('ShowcaseDataset');
const validatedDatasets = new WeakSet();
const PRIMARY_SKU = 'SHOW-TALADRO-18V';
const CART_SKU = 'SHOW-AMOLADORA-850';
const SECONDARY_CART_SKU = 'SHOW-SET-MANUAL';
// JdbcCatalogService.slug: lowercase, replace non-ASCII runs, trim '-', fallback.
export function showcaseCatalogSlug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

function requireDistinctSlugs(products, field) {
  const identities = new Map();
  for (const product of products) {
    const name = product[field];
    const slug = showcaseCatalogSlug(name);
    const identity = name.toLowerCase();
    if (identities.has(slug) && identities.get(slug) !== identity) invalid(field + 'SlugCollision');
    identities.set(slug, identity);
  }
}

// ArsAmount maximum is 999999999999.99. Three cart units plus one fee
// share four equal budgets; integer-peso fixture prices round their share down.
export const SHOWCASE_CHECKOUT_MAX_CENTS = 99999999999999n;
export const SHOWCASE_FEE_MAX_CENTS = SHOWCASE_CHECKOUT_MAX_CENTS / 4n;
export const SHOWCASE_PRICE_MAX = Number(SHOWCASE_CHECKOUT_MAX_CENTS / 4n / 100n);

function feeCents(raw) {
  const wire = typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : raw;
  if (typeof wire !== 'string' || !/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$/.test(wire)) invalid('deliveryCost');
  const [whole, fraction = ''] = wire.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
function invalid(field) { throw new Error('SHOWCASE_DATASET_INVALID:' + field); }
function object(raw, keys, field) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw) ||
      Object.keys(raw).length !== keys.length || keys.some(key => !Object.hasOwn(raw, key)) ||
      Object.keys(raw).some(key => !keys.includes(key))) invalid(field);
}
function text(raw, min, max, field) {
  if (typeof raw !== 'string' || raw !== raw.trim() || raw.length < min || raw.length > max ||
      /[\u0000-\u001f\u007f-\u009f]/u.test(raw)) invalid(field);
  return raw;
}
function integer(raw, min, max, field) {
  if (!Number.isSafeInteger(raw) || raw < min || raw > max) invalid(field);
  return raw;
}
function image(raw, field) {
  text(raw, 1, 2048, field);
  let url;
  try { url = new URL(raw); } catch { invalid(field); }
  if (!raw.startsWith('https://') || url.protocol !== 'https:' ||
      url.hostname !== 'images.unsplash.com' || url.username || url.password || url.port || url.hash) invalid(field);
  return raw;
}

export class ShowcaseProductFixture {
  constructor(token, fields) {
    if (token !== DATASET_TOKEN) throw new TypeError('Use ShowcaseDataset.fromWire');
    Object.assign(this, fields);
    this.images = Object.freeze([...fields.images]);
    Object.freeze(this);
  }
  get image() { return this.images[0]; }
  toCatalogCommand() {
    return { sku: this.sku, name: this.name, description: this.description, brand: this.brand,
      category: this.category, images: [...this.images], price: { base: this.price }, active: true,
      variants: [{ sku: this.sku, name: this.name, availableQuantity: this.stock,
        stockAdjustmentReason: 'LOCAL_SHOWCASE_RECONCILIATION' }] };
  }
}

export class ShowcaseJourney {
  constructor(token, products) {
    if (token !== DATASET_TOKEN) throw new TypeError('Use ShowcaseDataset.fromWire');
    this.primary = products.find(product => product.sku === PRIMARY_SKU);
    this.cart = products.find(product => product.sku === CART_SKU);
    this.secondaryCart = products.find(product => product.sku === SECONDARY_CART_SKU);
    if (!this.primary || !this.cart || !this.secondaryCart ||
        this.primary.stock < 2 || this.secondaryCart.stock < 2) invalid('journey');
    Object.freeze(this);
  }
  requireBudget(rawFee) {
    const fee = rawFee === undefined ? SHOWCASE_FEE_MAX_CENTS : feeCents(rawFee);
    const primarySubtotal = BigInt(this.primary.price) * 100n;
    const cartSubtotal = (BigInt(this.cart.price) + 2n * BigInt(this.secondaryCart.price)) * 100n;
    if (fee > SHOWCASE_FEE_MAX_CENTS || primarySubtotal > SHOWCASE_CHECKOUT_MAX_CENTS ||
        cartSubtotal > SHOWCASE_CHECKOUT_MAX_CENTS || primarySubtotal + fee > SHOWCASE_CHECKOUT_MAX_CENTS ||
        cartSubtotal + fee > SHOWCASE_CHECKOUT_MAX_CENTS) invalid('journeyBudget');
  }
}

export class ShowcaseDataset {
  constructor(token, schema, products, home) {
    if (token !== DATASET_TOKEN) throw new TypeError('Use ShowcaseDataset.fromWire');
    this.schema = schema;
    this.products = Object.freeze(products);
    this.home = Object.freeze(home);
    this.journey = new ShowcaseJourney(token, this.products);
    this.journey.requireBudget();
    validatedDatasets.add(this);
    Object.freeze(this);
  }
  static require(value) {
    if (!validatedDatasets.has(value)) invalid('instance');
    return value;
  }
  static fromWire(raw) {
    object(raw, ['schemaVersion', 'products', 'home'], 'root');
    const schema = ShowcaseDatasetSchema.fromWire(raw.schemaVersion);
    if (schema === ShowcaseDatasetSchema.Unknown) invalid('schemaVersion');
    if (!Array.isArray(raw.products) || raw.products.length < 3 || raw.products.length > 100) invalid('products');
    const products = raw.products.map((product, index) => {
      const field = 'products[' + index + ']';
      const productKeys = schema === ShowcaseDatasetSchema.V1
        ? ['sku', 'name', 'description', 'brand', 'category', 'image', 'price', 'stock']
        : ['sku', 'name', 'description', 'brand', 'category', 'images', 'price', 'stock'];
      object(product, productKeys, field);
      const sku = text(product.sku, 1, 69, field + '.sku');
      if (!/^SHOW-[A-Z0-9][A-Z0-9_-]{0,63}$/.test(sku)) invalid(field + '.sku');
      const images = schema === ShowcaseDatasetSchema.V1
        ? [image(product.image, field + '.image')]
        : (() => {
            if (!Array.isArray(product.images) || product.images.length < 2 || product.images.length > 4) invalid(field + '.images');
            const translated = product.images.map((value, imageIndex) => image(value, `${field}.images[${imageIndex}]`));
            if (new Set(translated).size !== translated.length) invalid(field + '.duplicateImage');
            return translated;
          })();
      return new ShowcaseProductFixture(DATASET_TOKEN, {
        sku, name: text(product.name, 1, 200, field + '.name'),
        description: text(product.description, 0, 5000, field + '.description'),
        brand: text(product.brand, 1, 100, field + '.brand'),
        category: text(product.category, 1, 100, field + '.category'),
        images,
        price: integer(product.price, 1, SHOWCASE_PRICE_MAX, field + '.price'),
        stock: integer(product.stock, 1, 1000000, field + '.stock'),
      });
    });
    if (new Set(products.map(product => product.sku)).size !== products.length) invalid('duplicateSku');
    requireDistinctSlugs(products, 'sku');
    requireDistinctSlugs(products, 'brand');
    requireDistinctSlugs(products, 'category');
    object(raw.home, ['title', 'body'], 'home');
    return new ShowcaseDataset(DATASET_TOKEN, schema, products, {
      title: text(raw.home.title, 1, 200, 'home.title'), body: text(raw.home.body, 1, 1000, 'home.body'),
    });
  }
}
Object.freeze(ShowcaseDataset);

export const DEFAULT_SHOWCASE_DATASET = ShowcaseDataset.fromWire({
  schemaVersion: 1,
  products: [
    { sku: PRIMARY_SKU, name: 'Taladro percutor 18V', description: 'Taladro inalámbrico para taller con dos baterías.', brand: 'Showcase Tools', category: 'Herramientas eléctricas', image: 'https://images.unsplash.com/photo-1504148455328-c376907d081c', price: 189900, stock: 12 },
    { sku: CART_SKU, name: 'Amoladora angular 850W', description: 'Amoladora compacta con protector regulable.', brand: 'Showcase Tools', category: 'Herramientas eléctricas', image: 'https://images.unsplash.com/photo-1586864387967-d02ef85d93e8', price: 87900, stock: 8 },
    { sku: SECONDARY_CART_SKU, name: 'Set de herramientas 108 piezas', description: 'Kit organizado para mantenimiento general.', brand: 'Showcase Pro', category: 'Herramientas manuales', image: 'https://images.unsplash.com/photo-1530124566582-a618bc2615dc', price: 149500, stock: 15 },
  ],
  home: { title: 'Todo para tu taller, en un solo lugar', body: 'Herramientas seleccionadas, stock visible y compra simple.' },
});
