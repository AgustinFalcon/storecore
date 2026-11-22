const SCHEMA_TOKEN = Symbol('ShowcaseDatasetSchema');
export class ShowcaseDatasetSchema {
  static V1 = new ShowcaseDatasetSchema(SCHEMA_TOKEN, 1);
  static V2 = new ShowcaseDatasetSchema(SCHEMA_TOKEN, 2);
  static V3 = new ShowcaseDatasetSchema(SCHEMA_TOKEN, 3);
  static Unknown = new ShowcaseDatasetSchema(SCHEMA_TOKEN, null);
  constructor(token, wire) {
    if (token !== SCHEMA_TOKEN) throw new TypeError('ShowcaseDatasetSchema is closed');
    this.wire = wire;
    Object.freeze(this);
  }
  static fromWire(raw) {
    if (raw === this.V1.wire) return this.V1;
    if (raw === this.V2.wire) return this.V2;
    if (raw === this.V3.wire) return this.V3;
    return this.Unknown;
  }
}
Object.freeze(ShowcaseDatasetSchema);

function closedWireType(name, cases) {
  const token = Symbol(name);
  class ClosedValue {
    constructor(key, wire) { if (key !== token) throw new TypeError(`${name} is closed`); this.wire = wire; Object.freeze(this); }
    static fromWire(raw) { return this.values.find(value => value.wire === raw) ?? this.Unknown; }
  }
  for (const [key, wire] of Object.entries(cases)) ClosedValue[key] = new ClosedValue(token, wire);
  ClosedValue.Unknown = new ClosedValue(token, 'unknown');
  ClosedValue.values = Object.freeze(Object.keys(cases).map(key => ClosedValue[key]));
  return Object.freeze(ClosedValue);
}

export const ShowcaseSeedProfile = closedWireType('ShowcaseSeedProfile', { FullDemo: 'FULL_DEMO' });
export const ShowcaseFixtureOfferStatus = closedWireType('ShowcaseFixtureOfferStatus', { Draft: 'DRAFT', Active: 'ACTIVE', Paused: 'PAUSED', Ended: 'ENDED' });
export const ShowcaseFixtureDiscountKind = closedWireType('ShowcaseFixtureDiscountKind', { Percent: 'PERCENT', Fixed: 'FIXED' });
export const ShowcaseFixtureHomeKind = closedWireType('ShowcaseFixtureHomeKind', {
  Hero: 'HERO', CategoryRail: 'CATEGORY_RAIL', ProductRail: 'PRODUCT_RAIL', PromoBanner: 'PROMO_BANNER',
});

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
function internalRoute(raw, field) {
  text(raw, 1, 2048, field);
  let url;
  try { url = new URL(raw, 'https://storecore.invalid'); } catch { invalid(field); }
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || /\s|[\u0000-\u001f\u007f-\u009f]/u.test(raw) ||
      url.origin !== 'https://storecore.invalid' || /%(2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/iu.test(raw)) invalid(field);
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
  constructor(token, schema, products, home, experience = null) {
    if (token !== DATASET_TOKEN) throw new TypeError('Use ShowcaseDataset.fromWire');
    this.schema = schema;
    this.products = Object.freeze(products);
    this.home = Object.freeze(home);
    this.experience = experience;
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
    const rootKeys = raw?.schemaVersion === 3 ? ['schemaVersion', 'products', 'home', 'experience'] : ['schemaVersion', 'products', 'home'];
    object(raw, rootKeys, 'root');
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
        stock: integer(product.stock, schema === ShowcaseDatasetSchema.V3 ? 0 : 1, 1000000, field + '.stock'),
      });
    });
    if (new Set(products.map(product => product.sku)).size !== products.length) invalid('duplicateSku');
    requireDistinctSlugs(products, 'sku');
    requireDistinctSlugs(products, 'brand');
    requireDistinctSlugs(products, 'category');
    object(raw.home, ['title', 'body'], 'home');
    const home = {
      title: text(raw.home.title, 1, 200, 'home.title'), body: text(raw.home.body, 1, 1000, 'home.body'),
    };
    return new ShowcaseDataset(DATASET_TOKEN, schema, products, home,
      schema === ShowcaseDatasetSchema.V3 ? translateExperience(raw.experience, products, home) : null);
  }
}
Object.freeze(ShowcaseDataset);

function translateExperience(raw, products, legacyHome) {
  object(raw, ['profile', 'cart', 'favoriteSkus', 'addresses', 'offers', 'homeSections'], 'experience');
  const profile = ShowcaseSeedProfile.fromWire(raw.profile);
  if (profile === ShowcaseSeedProfile.Unknown) invalid('experience.profile');
  const knownSkus = new Set(products.map(product => product.sku));
  const knownCategories = new Set(products.map(product => product.category.toLowerCase()));
  const uniqueSkus = (values, field, min, max) => {
    if (!Array.isArray(values) || values.length < min || values.length > max) invalid(field);
    const result = values.map((value, index) => text(value, 1, 69, `${field}[${index}]`));
    if (new Set(result).size !== result.length || result.some(value => !knownSkus.has(value))) invalid(field);
    return Object.freeze(result);
  };
  if (!Array.isArray(raw.cart) || raw.cart.length < 2 || raw.cart.length > 8) invalid('experience.cart');
  const cart = raw.cart.map((line, index) => {
    object(line, ['sku', 'quantity'], `experience.cart[${index}]`);
    const sku = text(line.sku, 1, 69, `experience.cart[${index}].sku`);
    if (!knownSkus.has(sku)) invalid(`experience.cart[${index}].sku`);
    return Object.freeze({ sku, quantity: integer(line.quantity, 1, 99, `experience.cart[${index}].quantity`) });
  });
  if (new Set(cart.map(line => line.sku)).size !== cart.length) invalid('experience.cart');
  const prices = new Map(products.map(product => [product.sku, BigInt(product.price)]));
  const cartCents = cart.reduce((sum, line) => sum + prices.get(line.sku) * BigInt(line.quantity) * 100n, 0n);
  if (cartCents + SHOWCASE_FEE_MAX_CENTS > SHOWCASE_CHECKOUT_MAX_CENTS) invalid('experience.cartBudget');
  if (!Array.isArray(raw.addresses) || raw.addresses.length < 1 || raw.addresses.length > 5) invalid('experience.addresses');
  const addresses = raw.addresses.map((address, index) => {
    const field = `experience.addresses[${index}]`;
    object(address, ['label', 'recipient', 'street', 'number', 'floorApartment', 'city', 'province', 'postalCode', 'notes', 'isDefault'], field);
    if (typeof address.isDefault !== 'boolean') invalid(`${field}.isDefault`);
    return Object.freeze({ label: text(address.label, 1, 80, `${field}.label`), recipient: text(address.recipient, 1, 160, `${field}.recipient`),
      street: text(address.street, 1, 160, `${field}.street`), number: text(address.number, 1, 20, `${field}.number`),
      floorApartment: address.floorApartment === null ? null : text(address.floorApartment, 1, 40, `${field}.floorApartment`),
      city: text(address.city, 1, 100, `${field}.city`), province: text(address.province, 1, 100, `${field}.province`),
      postalCode: text(address.postalCode, 1, 20, `${field}.postalCode`), notes: address.notes === null ? null : text(address.notes, 1, 300, `${field}.notes`), isDefault: address.isDefault });
  });
  if (addresses.filter(address => address.isDefault).length !== 1) invalid('experience.addresses.default');
  if (!Array.isArray(raw.offers) || raw.offers.length < 1 || raw.offers.length > 30) invalid('experience.offers');
  const offers = raw.offers.map((offer, index) => {
    const field = `experience.offers[${index}]`;
    object(offer, ['key', 'name', 'priority', 'startsInDays', 'endsInDays', 'discountKind', 'discountValue', 'minMarginPercent', 'skus', 'status'], field);
    const status = ShowcaseFixtureOfferStatus.fromWire(offer.status);
    const discountKind = ShowcaseFixtureDiscountKind.fromWire(offer.discountKind);
    if (status === ShowcaseFixtureOfferStatus.Unknown || discountKind === ShowcaseFixtureDiscountKind.Unknown) invalid(field);
    const discountValue = integer(offer.discountValue, 1, discountKind === ShowcaseFixtureDiscountKind.Percent ? 100 : SHOWCASE_PRICE_MAX, `${field}.discountValue`);
    const startsInDays = integer(offer.startsInDays, -365, 365, `${field}.startsInDays`);
    const endsInDays = integer(offer.endsInDays, -365, 730, `${field}.endsInDays`);
    if (startsInDays >= endsInDays) invalid(`${field}.window`);
    return Object.freeze({ key: text(offer.key, 1, 80, `${field}.key`), name: text(offer.name, 1, 160, `${field}.name`),
      priority: integer(offer.priority, 0, 1000000, `${field}.priority`), startsInDays, endsInDays, discountKind, discountValue,
      minMarginPercent: integer(offer.minMarginPercent, 0, 0, `${field}.minMarginPercent`),
      skus: uniqueSkus(offer.skus, `${field}.skus`, 1, 50), status });
  });
  if (new Set(offers.map(offer => offer.key)).size !== offers.length || new Set(offers.map(offer => offer.name)).size !== offers.length) invalid('experience.offers.identity');
  if (!Array.isArray(raw.homeSections) || raw.homeSections.length < 4 || raw.homeSections.length > 20) invalid('experience.homeSections');
  const homeSections = raw.homeSections.map((section, index) => translateHomeSection(section, index, knownSkus, knownCategories, legacyHome));
  if (new Set(homeSections.map(section => section.key)).size !== homeSections.length) invalid('experience.homeSections.identity');
  return Object.freeze({ profile, cart: Object.freeze(cart), favoriteSkus: uniqueSkus(raw.favoriteSkus, 'experience.favoriteSkus', 1, 30),
    addresses: Object.freeze(addresses), offers: Object.freeze(offers), homeSections: Object.freeze(homeSections) });
}

function translateHomeSection(section, index, knownSkus, knownCategories, legacyHome) {
  const field = `experience.homeSections[${index}]`;
  object(section, ['key', 'kind', 'active', 'sortOrder', 'content'], field);
  const kind = ShowcaseFixtureHomeKind.fromWire(section.kind);
  if (kind === ShowcaseFixtureHomeKind.Unknown || typeof section.active !== 'boolean') invalid(field);
  const base = { key: text(section.key, 1, 80, `${field}.key`), kind, active: section.active, sortOrder: integer(section.sortOrder, 0, 1000, `${field}.sortOrder`) };
  if (kind === ShowcaseFixtureHomeKind.Hero || kind === ShowcaseFixtureHomeKind.PromoBanner) {
    object(section.content, ['title', 'body', 'ctaLabel', 'ctaPath'], `${field}.content`);
    return Object.freeze({ ...base, content: Object.freeze({ title: text(section.content.title || legacyHome.title, 1, 120, `${field}.content.title`),
      body: text(section.content.body || legacyHome.body, 0, kind === ShowcaseFixtureHomeKind.Hero ? 500 : 300, `${field}.content.body`),
      ctaLabel: section.content.ctaLabel === null ? null : text(section.content.ctaLabel, 1, 80, `${field}.content.ctaLabel`),
      ctaPath: section.content.ctaPath === null ? null : internalRoute(section.content.ctaPath, `${field}.content.ctaPath`) }) });
  }
  if (kind === ShowcaseFixtureHomeKind.CategoryRail) {
    object(section.content, ['title', 'categoryNames'], `${field}.content`);
    if (!Array.isArray(section.content.categoryNames) || section.content.categoryNames.length < 1 || section.content.categoryNames.length > 12) invalid(`${field}.content.categoryNames`);
    const categoryNames = section.content.categoryNames.map((value, categoryIndex) => text(value, 1, 100, `${field}.content.categoryNames[${categoryIndex}]`));
    if (new Set(categoryNames.map(value => value.toLowerCase())).size !== categoryNames.length ||
        categoryNames.some(value => !knownCategories.has(value.toLowerCase()))) invalid(`${field}.content.categoryNames`);
    return Object.freeze({ ...base, content: Object.freeze({ title: text(section.content.title, 1, 120, `${field}.content.title`), categoryNames: Object.freeze(categoryNames) }) });
  }
  object(section.content, ['title', 'skus'], `${field}.content`);
  if (!Array.isArray(section.content.skus) || section.content.skus.length < 1 || section.content.skus.length > 20 ||
      new Set(section.content.skus).size !== section.content.skus.length || section.content.skus.some(sku => !knownSkus.has(sku))) invalid(`${field}.content.skus`);
  return Object.freeze({ ...base, content: Object.freeze({ title: text(section.content.title, 1, 120, `${field}.content.title`), skus: Object.freeze([...section.content.skus]) }) });
}

export const DEFAULT_SHOWCASE_DATASET = ShowcaseDataset.fromWire({
  schemaVersion: 1,
  products: [
    { sku: PRIMARY_SKU, name: 'Taladro percutor 18V', description: 'Taladro inalámbrico para taller con dos baterías.', brand: 'Showcase Tools', category: 'Herramientas eléctricas', image: 'https://images.unsplash.com/photo-1504148455328-c376907d081c', price: 189900, stock: 12 },
    { sku: CART_SKU, name: 'Amoladora angular 850W', description: 'Amoladora compacta con protector regulable.', brand: 'Showcase Tools', category: 'Herramientas eléctricas', image: 'https://images.unsplash.com/photo-1586864387967-d02ef85d93e8', price: 87900, stock: 8 },
    { sku: SECONDARY_CART_SKU, name: 'Set de herramientas 108 piezas', description: 'Kit organizado para mantenimiento general.', brand: 'Showcase Pro', category: 'Herramientas manuales', image: 'https://images.unsplash.com/photo-1530124566582-a618bc2615dc', price: 149500, stock: 15 },
  ],
  home: { title: 'Todo para tu taller, en un solo lugar', body: 'Herramientas seleccionadas, stock visible y compra simple.' },
});
