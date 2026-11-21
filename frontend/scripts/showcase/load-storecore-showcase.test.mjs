import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { ShowcaseDataset, DEFAULT_SHOWCASE_DATASET } from './showcase-dataset.mjs';
import * as domain from './load-storecore-showcase.mjs';
import {
  ShowcaseAdapterMode, ShowcaseCapability, ShowcaseCapabilityState, ShowcaseConfig,
  ShowcaseOrderStatus, ShowcasePaymentStatus, ShowcaseRole, ShowcaseStage,
  ShowcaseLoader,
} from './load-storecore-showcase.mjs';

function importedWire() {
  return { schemaVersion: DEFAULT_SHOWCASE_DATASET.schema.wire,
    products: DEFAULT_SHOWCASE_DATASET.products.map(product => ({ ...product })),
    home: { title: 'Taller importado', body: 'Contenido importado por archivo local.' } };
}

test('slug collisions and declared journey fee overflow reject before any HTTP', async t => {
  const { state, run } = await api(t);
  for (const field of ['sku', 'brand', 'category']) {
    const raw = importedWire();
    if (field === 'sku') raw.products.push({ ...raw.products[0], sku: 'SHOW-TALADRO_18V' });
    else { raw.products[0][field] = 'Tool A'; raw.products[1][field] = 'Tool-A'; }
    assert.throws(() => run(ShowcaseDataset.fromWire(raw)), /SlugCollision/);
  }
  const overflow = importedWire(); overflow.products[1].price = 999999999999;
  assert.throws(() => run(ShowcaseDataset.fromWire(overflow)), /price/);
  assert.deepEqual(state.requests, []);
  const fee = await api(t, { manualFulfillmentPolicy: { localDelivery: { cost: '250000000000.00' } } });
  assert.throws(() => fee.run(), /journeyBudget/);
  assert.deepEqual(fee.state.requests, []);
});


test('imported fixture resumes after a late failure without duplicating order or reservation', async t => {
  let fail = true;
  const dataset = ShowcaseDataset.fromWire(importedWire());
  const { state, run } = await api(t, { dataset, response: result => {
    if (fail && result.path.endsWith('/favorites/' + dataset.journey.primary.sku) && result.method === 'PUT') {
      fail = false;
      result.payload.data.outcome = 'future';
      return { status: result.status, payload: result.payload };
    }
  } });
  await assert.rejects(run(), /FAVORITES_VERIFICATION_FAILED/);
  assert.equal(state.orders.length, 1);
  const product = clone(state.products[dataset.journey.primary.sku]);
  const result = await run();
  assert.equal(result.pendingOrderCreated, false);
  assert.equal(state.orders.length, 1);
  assert.deepEqual(state.products[dataset.journey.primary.sku], product);
  assert.equal(state.requests.filter(request => request.path.endsWith('/checkout')).length, 1);
});

test('imported reordered dataset creates exact fields and fourth product, then replays without writes', async t => {
  const raw = importedWire();
  raw.products[0].name = 'Taladro importado';
  raw.products[0].description = 'Descripción importada';
  raw.products[0].price = 199999;
  raw.products[0].stock = 25;
  raw.products[0].image = 'https://images.unsplash.com/photo-custom-import';
  raw.products.push({ ...raw.products[1], sku: 'SHOW-EXTRA', name: 'Producto adicional' });
  raw.products.reverse();
  const dataset = ShowcaseDataset.fromWire(raw);
  const { state, run } = await api(t, { dataset, requireRealRouteReceipt: true });
  const first = await run();
  assert.equal(first.products, 4);
  assert.equal(first.receipt.products.length, 4);
  assert.equal(first.receipt.homeTitle, raw.home.title);
  assert.equal(state.orders[0].lines[0].sku, dataset.journey.primary.sku);
  assert.deepEqual(state.cart.lines.map(line => [line.sku, line.quantity]), [
    [dataset.journey.cart.sku, 1], [dataset.journey.secondaryCart.sku, 2],
  ]);
  const create = state.requests.find(request => request.path.endsWith('/' + dataset.journey.primary.sku) && request.method === 'PUT');
  assert.deepEqual(create.body, dataset.journey.primary.toCatalogCommand());
  assert.equal(state.products['SHOW-EXTRA'].name, 'Producto adicional');
  const count = state.writes.length;
  const replay = await run();
  assert.equal(state.writes.length, count);
  assert.equal(replay.pendingOrderCreated, false);
  assert.deepEqual(replay.receipt, first.receipt);
});

test('changed input preserves existing operator fields, images, stock, home and collections', async t => {
  const raw = importedWire();
  const { state, run } = await api(t, { dataset: ShowcaseDataset.fromWire(raw) });
  await run();
  state.products[SKUS[0]].name = 'Operator edited';
  state.products[SKUS[0]].images = ['https://example.invalid/operator.jpg'];
  state.products[SKUS[0]].media[0].url = state.products[SKUS[0]].images[0];
  state.products[SKUS[0]].price.base = 5;
  state.products[SKUS[0]].variants[0].availableQuantity = 99;
  state.products[SKUS[0]].status = domain.ShowcaseProductStatus.Archived.wire;
  state.home.sections = [{ key: 'operator', kind: 'future-kind', content: { custom: true } }];
  state.home.revision++;
  const before = clone({ products: state.products, home: state.home, cart: state.cart, orders: state.orders, offers: state.offers, favorites: state.favorites });
  raw.products[0].name = 'New input ignored for existing product';
  raw.products[0].stock = 100;
  raw.home.title = 'New input home ignored';
  const count = state.writes.length;
  await run(ShowcaseDataset.fromWire(raw));
  assert.equal(state.writes.length, count);
  assert.deepEqual({ products: state.products, home: state.home, cart: state.cart, orders: state.orders, offers: state.offers, favorites: state.favorites }, before);
});

test('invalid or forged injected datasets fail before HTTP', async t => {
  const { state, run } = await api(t);
  for (const raw of [importedWire(), Object.create(ShowcaseDataset.prototype), null]) {
    assert.throws(() => run(raw), /SHOWCASE_DATASET_INVALID/);
  }
  assert.deepEqual(state.requests, []);
  assert.deepEqual(state.writes, []);
});

test('imported create and readback verify imported image and price rather than default constants', async t => {
  for (const field of ['image', 'price']) await t.test(field, async t => {
    const raw = importedWire();
    raw.products[0].image = 'https://images.unsplash.com/photo-import-only';
    raw.products[0].price = 123456;
    const { run } = await api(t, { dataset: ShowcaseDataset.fromWire(raw), response: result => {
      if (result.path === '/api/v1/user/catalog/products/' + SKUS[0] && result.method === 'PUT') {
        if (field === 'image') result.payload.data.media[0].url = DEFAULT_SHOWCASE_DATASET.journey.primary.image;
        else result.payload.data.price.base = DEFAULT_SHOWCASE_DATASET.journey.primary.price;
        return { status: result.status, payload: result.payload };
      }
    } });
    await assert.rejects(run(), /CATALOG_VERIFICATION_FAILED/);
  });
});

const valid = {
  baseUrl: 'http://127.0.0.1:8080', origin: 'http://localhost:4200',
  adminEmail: 'admin@storecore.invalid', adminPassword: 'not-logged-or-serialized',
};

test('closed stage translates known and unknown wires', () => {
  assert.equal(ShowcaseStage.fromWire('CART'), ShowcaseStage.Cart);
  assert.equal(ShowcaseStage.fromWire('future-stage'), ShowcaseStage.Unknown);
  assert.throws(() => new ShowcaseStage(null, 'INJECTED', 'Injected'), /closed/);
});

test('roles, adapter modes and commerce statuses translate unknown wires closed', () => {
  assert.equal(ShowcaseRole.fromWire('ADMIN'), ShowcaseRole.Admin);
  assert.equal(ShowcaseRole.fromWire('OWNER'), ShowcaseRole.Unknown);
  assert.equal(ShowcaseAdapterMode.fromWire('unconfigured'), ShowcaseAdapterMode.Unconfigured);
  assert.equal(ShowcaseAdapterMode.fromWire('official'), ShowcaseAdapterMode.Unknown);
  assert.equal(ShowcasePaymentStatus.fromWire('PENDING'), ShowcasePaymentStatus.Pending);
  assert.equal(ShowcasePaymentStatus.fromWire('APPROVED'), ShowcasePaymentStatus.Unknown);
  assert.equal(ShowcaseOrderStatus.fromWire('PENDING_PAYMENT'), ShowcaseOrderStatus.PendingPayment);
  assert.equal(ShowcaseOrderStatus.fromWire('PAID'), ShowcaseOrderStatus.Unknown);
});

test('showcase capabilities and states are closed and fail unknown wires closed', () => {
  assert.equal(ShowcaseCapability.fromWire('CATALOG'), ShowcaseCapability.Catalog);
  assert.equal(ShowcaseCapability.fromWire('ML_PRICE_AUTOMATION'), ShowcaseCapability.Unknown);
  assert.throws(() => new ShowcaseCapability(null, 'INJECTED'), /closed/);
  assert.equal(ShowcaseCapabilityState.fromWire('ACTIVE'), ShowcaseCapabilityState.Active);
  assert.equal(ShowcaseCapabilityState.fromWire('PAUSED'), ShowcaseCapabilityState.Unknown);
  assert.throws(() => new ShowcaseCapabilityState(null, 'INJECTED'), /closed/);
});
test('config accepts only explicit loopback targets', () => {
  const config = new ShowcaseConfig(valid);
  assert.equal(config.baseUrl, 'http://127.0.0.1:8080');
  assert.equal(config.customerEmail, 'showcase.customer@storecore.invalid');
  assert.throws(() => new ShowcaseConfig({ ...valid, baseUrl: 'https://store.example.com' }), /LOOPBACK_TARGET/);
  assert.throws(() => new ShowcaseConfig({ ...valid, origin: 'https://admin.example.com' }), /LOOPBACK_ORIGIN/);
  assert.throws(() => new ShowcaseConfig({ ...valid, origin: 'https://localhost:4200' }), /LOOPBACK_ORIGIN/);
  assert.throws(() => new ShowcaseConfig({ ...valid, origin: 'ftp://127.0.0.1' }), /LOOPBACK_ORIGIN/);
});

test('config requires admin authority and synthetic customer identity', () => {
  assert.throws(() => new ShowcaseConfig({ ...valid, adminPassword: '' }), /ADMIN_PASSWORD_REQUIRED/);
  assert.throws(() => new ShowcaseConfig({ ...valid, customerEmail: 'real@example.com' }), /INVALID_TLD/);
  assert.equal(new ShowcaseConfig(valid).requireRealRouteReceipt, false);
  assert.throws(() => new ShowcaseConfig({ ...valid, requireRealRouteReceipt: true }), /REQUIRES_PENDING_ORDER/);
});

const SKUS = ['SHOW-TALADRO-18V', 'SHOW-AMOLADORA-850', 'SHOW-SET-MANUAL'];
const clone = (value) => structuredClone(value);
const known = (value) => ({ state: domain.ShowcaseFactState.Known.wire, value, reason: null });
const queue = (items = []) => ({ state: domain.ShowcaseFactState.Known.wire, items, totalCount: items.length, truncated: false, reason: null });
function overview() {
  return { period: domain.ShowcaseOverviewPeriod.Last30Days.wire, timezone: 'America/Argentina/Buenos_Aires',
    fromInclusive: '2026-01-01T00:00:00Z', toExclusive: '2026-02-01T00:00:00Z', accreditedRevenue: known(0),
    orderCount: known(1), activeCustomerCount: known(1), inventoryAtRiskCount: known(0),
    pendingPayments: queue(), fulfillment: queue(), lowStock: queue() };
}

// A real loopback server exercises fetch, cookies, rotating CSRF, envelopes and
// persistent mutations. It is API-contract evidence, not a PostgreSQL substitute.
async function api(t, options = {}) {
  const state = {
    modules: [...ShowcaseCapability.values, ...domain.ShowcaseExternalCapability.values.filter(value => value !== domain.ShowcaseExternalCapability.Blackstore)].map((capability) => ({
      module: capability.wire, state: ShowcaseCapabilityState.Disabled.wire, configVersion: 1,
    })),
    safety: { mpOrdersAdapter: ShowcaseAdapterMode.Unconfigured.wire, externalCheckoutDisabled: true,
      externalCapabilities: domain.ShowcaseExternalCapability.values.map(capability => ({ module: capability.wire, state: ShowcaseCapabilityState.Disabled.wire })) },
    home: { revision: 0, sections: [] }, products: {}, customer: null, addresses: [], orders: [], cart: { revision: 'cart-empty', lines: [], deliveryOptions:[{mode:domain.ShowcaseDeliveryMode.LocalDelivery.wire,label:'Entrega fixture',cost:0,currency:'ARS',minDays:1,maxDays:2,requiresAddress:true,configurationVersion:2,destination:null,instructions:null}] },
    favorites: [], offers: [], csrf: { user: '', customer: '' }, tokens: { user: 0, customer: 0 }, requests: [], writes: [], errors: [],
    overview: overview(),
  };
  options.prepare?.(state);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const path = url.pathname;
    const method = request.method;
    let body;
    try {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      body = raw ? JSON.parse(raw) : undefined;
      state.requests.push({ path, method, body, cookie: request.headers.cookie, csrf: request.headers['x-csrf-token'], search: url.search });
      let data;
      let status = 200;
      let code;
      let errorCode = null;
      const customer = path.startsWith('/api/v1/customer');
      const realm = customer ? 'customer' : 'user';
      const login = path.endsWith('/auth/login');
      const register = path.endsWith('/auth/register');
      const health = path.endsWith('/health');
      const rotate = () => {
        state.csrf[realm] = `${realm}-${++state.tokens[realm]}`;
        response.setHeader('x-csrf-token', state.csrf[realm]);
      };
      if (!health && !login && !register) {
        assert.equal(request.headers.cookie, `${realm}=session`, `realm cookie for ${path}`);
        if (method !== 'GET') {
          assert.equal(request.headers['x-csrf-token'], state.csrf[realm], `rotated CSRF for ${path}`);
          assert.equal(request.headers.origin, valid.origin);
          if (options.rejectMutation) { status = 403; errorCode = 'CSRF_INVALID'; }
          else rotate();
        }
      }
      if (status !== 403) {
        if (health) data = { status: 'UP' };
        else if (login) {
          if (customer && state.customer === null) { status = 401; data = null; errorCode = 'AUTH_INVALID'; }
          else {
            data = customer ? state.customer : { id: 7, roles: [ShowcaseRole.Admin.wire] };
            response.setHeader('set-cookie', `${realm}=session; HttpOnly; Path=/`); rotate();
          }
        } else if (register) {
          assert.equal(request.headers.cookie, undefined);
          state.customer = { id: 42, email: body.email, firstName: body.firstName, lastName: body.lastName,
            phone: null, state: domain.ShowcaseCustomerState.Active.wire, createdAt: '2026-01-01T00:00:00Z', orderCount: 0, lastOrderAt: null };
          data = state.customer; status = 201;
          response.setHeader('set-cookie', 'customer=session; HttpOnly; Path=/'); rotate();
        } else if (path.endsWith('/showcase-safety')) data = state.safety;
        else if (path === '/api/v1/user/capabilities') data = state.modules;
        else if (path.endsWith('/MANUAL_FULFILLMENT/policy')) {
          const module=state.modules.find(item=>item.module===ShowcaseCapability.ManualFulfillment.wire);
          assert.equal(body.expectedConfigVersion,module.configVersion);module.configVersion++;data={configurationVersion:module.configVersion};
        }
        else if (path.startsWith('/api/v1/user/capabilities/')) {
          const module = state.modules.find((item) => item.module === path.split('/')[5]);
          assert.equal(body.expectedConfigVersion, module.configVersion);
          module.state = body.state; module.configVersion++; data = module;
          if (module.module === ShowcaseCapability.ManualFulfillment.wire) state.cart.deliveryOptions?.forEach(option => option.configurationVersion = module.configVersion);
        } else if (path === '/api/v1/user/content/home') {
          if (method === 'PUT') {
            assert.equal(body.expectedRevision, state.home.revision);
            state.home = { revision: state.home.revision + 1, sections: clone(body.sections) };
          }
          data = state.home;
        } else if (path.startsWith('/api/v1/user/catalog/products/')) {
          const sku = decodeURIComponent(path.split('/').at(-1));
          if (method === 'PUT') {
            const id = String(509 + Object.keys(state.products).length * 31);
            const variant = body.variants[0];
            state.products[sku] = { id, sku, name: body.name, description: body.description, brand: body.brand, category: body.category,
              status: domain.ShowcaseProductStatus.Active.wire, active: true,
              images: clone(body.images), media: body.images.map((url, index) => ({ id: String(Number(id) * 100 + index), url, sortOrder: index, primary: index === 0 })),
              price: { base: body.price.base, original: body.price.base, effective: body.price.base, offer: null },
              variants: [{ id, sku, name: variant.name, status: domain.ShowcaseVariantStatus.Active.wire, active: true, attributes: {},
                availableQuantity: variant.availableQuantity, availability: domain.ShowcaseVariantAvailability.Available.wire,
                inventory: { variantId: id, sku, productName: body.name, variantLabel: variant.name,
                  available: variant.availableQuantity, reserved: 0, onHand: variant.availableQuantity, safety: 0, saleable: variant.availableQuantity,
                  state: domain.ShowcaseInventoryState.Known.wire, updatedAt: '2026-01-01T00:00:00Z' } }],
            };
          }
          data = state.products[sku] ?? null;
          if (data === null) { status = 404; errorCode = 'RESOURCE_NOT_FOUND'; }
        } else if (path === '/api/v1/customer/me') data = state.customer;
        else if (path === '/api/v1/customer/me/addresses') {
          if (method === 'POST') { const address = { id: 73, revision: '2026-01-01T01:02:03.123456Z', ...body }; state.addresses.push(address); data = address; }
          else data = state.addresses;
        } else if (path === '/api/v1/customer/orders') data = page(state.orders, url);
        else if (path.startsWith('/api/v1/customer/orders/')) data = state.orders.find((order) => String(order.id) === path.split('/').at(-1));
        else if (path === '/api/v1/customer/cart') data = state.cart;
        else if (path.endsWith('/cart/items')) {
          const line = state.cart.lines.find((item) => item.sku === body.sku);
          if (line) line.quantity = body.quantity; else state.cart.lines.push(clone(body));
          state.cart.revision = `cart-${state.cart.revision}-changed`;
          data = state.cart;
        } else if (path.endsWith('/checkout')) {
          assert.deepEqual(state.cart.lines, [{ sku: SKUS[0], quantity: 1 }]);
          assert.equal(body.cartRevision, state.cart.revision);
          assert.equal(body.addressRevision, state.addresses[0].revision);
          const order = { id: String(601 + state.orders.length * 29), paymentStatus: ShowcasePaymentStatus.Pending.wire,
            orderStatus: ShowcaseOrderStatus.PendingPayment.wire, lines: clone(state.cart.lines) };
          state.orders.push(order); state.cart.lines = []; state.cart.revision = 'cart-after-checkout'; state.customer.orderCount++;
          const variant = state.products[SKUS[0]].variants[0];
          variant.availableQuantity--; variant.inventory.available--; variant.inventory.saleable--; variant.inventory.reserved++;
          state.customer.lastOrderAt = '2026-01-02T00:00:00Z';
          data = { orderId: order.id, paymentStatus: order.paymentStatus, orderStatus: order.orderStatus, checkoutUrl: null };
        } else if (path === '/api/v1/customer/favorites') data = state.favorites;
        else if (path.startsWith('/api/v1/customer/favorites/')) {
          const sku = path.split('/').at(-1);
          const present = state.favorites.some((favorite) => favorite.sku === sku);
          if (!present) state.favorites.push({ sku, name: 'Synthetic', price: 10, imageUrl: null,
            availability: domain.ShowcaseFavoriteAvailability.Available.wire, addedAt: '2026-01-01T00:00:00Z' });
          data = { sku, outcome: (present ? domain.ShowcaseFavoriteOutcome.AlreadyPresent : domain.ShowcaseFavoriteOutcome.Added).wire };
        } else if (path === '/api/v1/user/offers') {
          if (method === 'POST') {
            const offer = { id: state.offers.length + 1, ...body, status: domain.ShowcaseOfferStatus.Draft.wire };
            state.offers.push(offer); data = offer; status = 201; code = 200;
          } else data = state.offers;
        } else if (path === '/api/v1/user/customers') {
          const others = options.customerRows ?? [];
          data = page([...others, state.customer], url, 'pageSize');
        } else if (path === '/api/v1/user/customers/42') data = state.customer;
        else if (path === '/api/v1/user/overview') data = state.overview;
        else throw new Error(`Unhandled ${method} ${path}`);
        if (method !== 'GET' && !login) state.writes.push({ path, method, body: clone(body) });
      }
      let outgoing = { status, payload: health ? data : { code: code ?? status, data: data ?? null, errorCode } };
      outgoing = options.response?.({ path, method, body, state, ...clone(outgoing) }) ?? outgoing;
      response.writeHead(outgoing.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(outgoing.payload));
    } catch (error) {
      state.errors.push(error.message);
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ code: 500, data: null, errorCode: 'TEST_SERVER_FAILURE' }));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); assert.deepEqual(state.errors, []); });
  const config = new ShowcaseConfig({ ...valid, baseUrl: `http://127.0.0.1:${server.address().port}`, includePendingOrder: options.includePendingOrder ?? true, manualFulfillmentPolicy: options.manualFulfillmentPolicy, requireRealRouteReceipt: options.requireRealRouteReceipt });
  return { state, run: (dataset = options.dataset) => new ShowcaseLoader(config, () => {}, dataset).run() };
}

function page(items, url, sizeKey = 'size') {
  const index = Number(url.searchParams.get('page'));
  const size = sizeKey === 'pageSize' ? 25 : Number(url.searchParams.get('size'));
  return { items: items.slice(index * size, (index + 1) * size), total: items.length, page: index, [sizeKey]: size };
}

test('every new wire type is closed and translates unknown values fail-closed', () => {
  for (const [name, type] of Object.entries(domain).filter(([name]) => name.startsWith('Showcase') && name !== 'ShowcaseConfig' && name !== 'ShowcaseLoader')) {
    for (const value of type.values) assert.equal(type.fromWire(value.wire), value, name);
    assert.equal(type.fromWire('FUTURE'), type.Unknown, name);
    assert.throws(() => new type(null, 'INJECTED'), /closed/, name);
  }
});

test('first load and replay use actual HTTP, isolated cookies and rotating CSRF with stable fixture counts', async (t) => {
  const { state, run } = await api(t, { requireRealRouteReceipt: true });
  const first = await run();
  assert.equal(first.products, 3); assert.equal(first.pendingOrderCreated, true);
  assert.equal(first.receipt.addressId, '73');
  assert.equal(first.receipt.addressRevision, state.addresses[0].revision);
  assert.equal(first.receipt.pendingOrderId, state.orders[0].id);
  assert.deepEqual(first.receipt.products.map(product => product.productId), SKUS.map(sku => state.products[sku].id));
  assert.equal(Object.keys(state.products).length, 3);
  assert.equal(state.addresses.length, 1); assert.equal(state.orders.length, 1);
  assert.equal(state.favorites.length, 1); assert.equal(state.offers.length, 1);
  const writes = state.writes.length;
  const replay = await run();
  assert.equal(replay.pendingOrderCreated, false);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(state.writes.length, writes, 'replay makes no domain/capability writes');
  assert.equal(state.requests.filter((request) => request.path.endsWith('/showcase-safety')).length, 4);
});

test('replay preserves operator home, inactive product, stock, price, address, cart, offer and unrelated favorite', async (t) => {
  const { state, run } = await api(t);
  await run();
  state.home.sections = [{ key: 'operator', kind: 'future-kind', content: { custom: true } }]; state.home.revision++;
  state.products[SKUS[0]].status = 'ARCHIVED'; state.products[SKUS[0]].price.base = 1;
  state.products[SKUS[0]].variants[0].availableQuantity = 99;
  state.addresses[0].city = 'Rosario'; state.addresses[0].isDefault = false;
  state.cart.lines = [{ sku: 'OPERATOR', quantity: 8 }];
  state.offers[0].status = domain.ShowcaseOfferStatus.Ended.wire; state.offers[0].discountValue = 9;
  state.favorites.push({ sku: 'OPERATOR', name: 'Operator', price: 1, imageUrl: null, availability: domain.ShowcaseFavoriteAvailability.Unavailable.wire, addedAt: '2026-01-03T00:00:00Z' });
  const before = clone({ home: state.home, products: state.products, addresses: state.addresses, cart: state.cart, offers: state.offers, favorites: state.favorites });
  const count = state.writes.length;
  await run();
  assert.deepEqual({ home: state.home, products: state.products, addresses: state.addresses, cart: state.cart, offers: state.offers, favorites: state.favorites }, before);
  assert.equal(state.writes.length, count);
});

test('strict receipt refuses incoherent retained data while general showcase preserves it', async (t) => {
  const general = await api(t);
  assert.deepEqual(await general.run(), { products: 3, pendingOrderCreated: true });
  const strict = await api(t, { requireRealRouteReceipt: true });
  await strict.run();
  strict.state.cart.lines = [{ sku: 'OPERATOR', quantity: 8 }];
  const before = clone(strict.state.cart);
  const count = strict.state.writes.length;
  await assert.rejects(strict.run(), /SHOWCASE_REAL_RECEIPT_INVALID/);
  assert.deepEqual(strict.state.cart, before);
  assert.equal(strict.state.writes.length, count);
});

test('checkout consumes the cart readback and keeps timestamp precision in authoritative revisions', async (t) => {
  const { state, run } = await api(t, { requireRealRouteReceipt: true, response: result => {
    if (result.path.endsWith('/cart/items') && result.method === 'PUT') {
      // Mutation response is deliberately stale. Only the following GET is authoritative.
      result.payload.data.revision = 'stale-mutation-response';
      return { status: result.status, payload: result.payload };
    }
  } });
  const result = await run();
  const checkoutIndex = state.requests.findIndex(request => request.path.endsWith('/checkout'));
  const checkout = state.requests[checkoutIndex];
  assert.equal(state.requests[checkoutIndex - 1].path, '/api/v1/customer/cart');
  assert.notEqual(checkout.body.cartRevision, 'stale-mutation-response');
  assert.equal(checkout.body.addressRevision, '2026-01-01T01:02:03.123456Z');
  assert.equal(result.receipt.cart.revision, state.cart.revision);
});

test('missing checkout revisions fail before creating an order', async (t) => {
  for (const field of ['cart', 'address']) await t.test(field, async t => {
    const { state, run } = await api(t, { response: result => {
      if (field === 'cart' && result.path === '/api/v1/customer/cart') delete result.payload.data.revision;
      if (field === 'address' && result.path === '/api/v1/customer/me/addresses' && result.method === 'POST') delete result.payload.data.revision;
      return { status: result.status, payload: result.payload };
    } });
    await assert.rejects(run(), /SHOWCASE_(CART_VERIFICATION_FAILED|ADDRESSES_INVALID)/);
    assert.equal(state.orders.length, 0);
  });
});

test('later customer/order pages are scanned; catalog verification uses direct admin identity regardless of list size', async (t) => {
  const { state, run } = await api(t, { customerRows: Array.from({ length: 26 }, (_, index) => ({ id: 100 + index, email: 'other@storecore.invalid' })) });
  await run();
  const fixtureOrder = state.orders[0];
  state.orders = [...Array.from({ length: 51 }, (_, index) => ({ id: String(100 + index), lines: [{ sku: 'OTHER', quantity: 1 }] })), fixtureOrder];
  for (let index = 0; index < 110; index++) state.products[`OTHER-${index}`] = { sku: `OTHER-${index}` };
  const writes = state.writes.length;
  await run();
  assert.equal(state.writes.length, writes);
  assert.ok(state.requests.some((request) => request.path.endsWith('/customers') && request.search.includes('page=1')));
  assert.ok(state.requests.some((request) => request.path.endsWith('/orders') && request.search.includes('page=1')));
  assert.equal(state.requests.some((request) => request.path === '/api/v1/catalog'), false);
});

test('external adapters/capabilities and invalid late activation fail during sequential preflight before domain writes', async (t) => {
  for (const prepare of [
    (state) => { state.safety.mpOrdersAdapter = 'official'; },
    (state) => { state.safety.mpOrdersAdapter = 'future'; },
    (state) => { state.safety.externalCheckoutDisabled = false; },
    (state) => { state.safety.externalCapabilities.find(row => row.module === domain.ShowcaseExternalCapability.Blackstore.wire).state = ShowcaseCapabilityState.Active.wire; },
    (state) => { state.safety.externalCapabilities.find(row => row.module === domain.ShowcaseExternalCapability.Blackstore.wire).state = 'future'; },
    (state) => { state.safety.externalCapabilities = state.safety.externalCapabilities.filter(row => row.module !== domain.ShowcaseExternalCapability.Blackstore.wire); },
    (state) => { state.safety.externalCapabilities.push(clone(state.safety.externalCapabilities[0])); },
    (state) => { state.modules.find((row) => row.module === domain.ShowcaseExternalCapability.Marketplace.wire).state = ShowcaseCapabilityState.Active.wire; },
    (state) => { state.modules.find((row) => row.module === domain.ShowcaseExternalCapability.Carriers.wire).state = 'future'; },
    (state) => { state.modules.find((row) => row.module === ShowcaseCapability.ManualPromotions.wire).state = 'future'; },
    (state) => { state.modules.find((row) => row.module === ShowcaseCapability.ManualPromotions.wire).configVersion = 0; },
    (state) => { state.modules.find((row) => row.module === ShowcaseCapability.ManualPromotions.wire).configVersion = 2147483648; },
  ]) await t.test('preflight rejection', async (t) => {
    const { state, run } = await api(t, { prepare });
    await assert.rejects(run(), /SHOWCASE_(EXTERNAL|CAPABILIT)/);
    assert.deepEqual(state.writes, []);
  });
});

test('nonempty operator cart prevents first checkout without modifying its lines', async (t) => {
  const { state, run } = await api(t, { prepare: (state) => { state.cart.lines = [{ sku: 'OPERATOR', quantity: 7 }]; } });
  await assert.rejects(run(), /REQUIRES_EMPTY_CART/);
  assert.deepEqual(state.cart.lines, [{ sku: 'OPERATOR', quantity: 7 }]);
  assert.equal(state.orders.length, 0);
  assert.equal(state.requests.some((request) => request.path.endsWith('/checkout')), false);
});

test('CSRF rejection aborts once without retrying or proceeding to customer mutations', async (t) => {
  const { state, run } = await api(t, { rejectMutation: true });
  await assert.rejects(run(), /CSRF_INVALID/);
  assert.equal(state.requests.filter((request) => request.path.includes('/capabilities/') && request.method === 'POST').length, 1);
  assert.equal(state.customer, null); assert.deepEqual(state.writes, []);
});

test('HTTP status and envelopes are strict except the specific offer-create 201/code200 contract', async (t) => {
  for (const [path, method, payload] of [
    ['/api/v1/customer/auth/register', 'POST', { code: 200, data: { id: 42 } }],
    ['/api/v1/internal/auth/login', 'POST', { code: 201, data: { id: 7, roles: [ShowcaseRole.Admin.wire] } }],
    ['/api/v1/internal/auth/login', 'POST', null],
    ['/api/v1/user/offers', 'POST', { code: 201, data: { id: 1 } }],
    ['/api/v1/user/offers', 'POST', { code: 200, data: null }],
  ]) await t.test(`${path} malformed envelope`, async (t) => {
    const { run } = await api(t, { response: (result) => result.path === path && result.method === method ? { status: result.status, payload } : undefined });
    await assert.rejects(run(), /INVALID_BASE_RESPONSE/);
  });
});

test('invalid CUSTOMER identity is rejected before any CUSTOMER write', async (t) => {
  const { state, run } = await api(t, { prepare: (state) => { state.customer = { id: 42, email: 'operator@storecore.invalid' }; } });
  await assert.rejects(run(), /CUSTOMER_IDENTITY_INVALID/);
  assert.equal(state.writes.some((write) => write.path.startsWith('/api/v1/customer')), false);
});

test('malformed pagination aborts without a checkout', async (t) => {
  const { state, run } = await api(t, { response: (result) => result.path === '/api/v1/customer/orders'
    ? { status: 200, payload: { code: 200, data: { items: [], page: 0, size: 50, total: 100 } } } : undefined });
  await assert.rejects(run(), /INVALID_PAGE/); assert.equal(state.orders.length, 0);
});

test('offer readback preserves the captured draft values and never silently accepts a different valid discount', async (t) => {
  const { run } = await api(t, { response: (result) => {
    if (result.path === '/api/v1/user/offers' && result.method === 'GET' && result.payload.data.length) {
      result.payload.data[0].discountValue = 9;
      return { status: result.status, payload: result.payload };
    }
  } });
  await assert.rejects(run(), /OFFER_VERIFICATION_FAILED/);
});

test('operator offer ownership collision fails without changing the collided offer', async (t) => {
  const { state, run } = await api(t);
  await run(); state.offers[0].skus = ['OPERATOR'];
  const before = clone(state.offers); const count = state.writes.length;
  await assert.rejects(run(), /OFFER_VERIFICATION_FAILED/);
  assert.deepEqual(state.offers, before); assert.equal(state.writes.length, count);
});

test('new product create response and final T06 readback preserve written fields, inventory formulas and ordered media', async (t) => {
  const cases = [
    ['name', (data) => { data.name = 'Wrong name'; }],
    ['price', (data) => { data.price.base++; }],
    ['effective price', (data) => { data.price.effective--; }],
    ['status', (data) => { data.status = domain.ShowcaseProductStatus.Draft.wire; }],
    ['variant identity', (data) => { data.variants[0].id = '999'; }],
    ['inventory quantity', (data) => { data.variants[0].inventory.available++; }],
    ['inventory reserved', (data) => { data.variants[0].inventory.reserved++; }],
    ['inventory safety', (data) => { data.variants[0].inventory.safety++; }],
    ['inventory state', (data) => { data.variants[0].inventory.state = 'future'; }],
    ['inventory availability', (data) => { data.variants[0].availability = domain.ShowcaseVariantAvailability.OutOfStock.wire; }],
    ['inventory formula', (data) => { data.variants[0].inventory.onHand++; }],
    ['media url', (data) => { data.media[0].url = 'https://example.invalid/wrong.jpg'; }],
    ['media order', (data) => { data.media[0].sortOrder = 5; }],
  ];
  for (const [name, corrupt] of cases) await t.test(name, async (t) => {
    const { run } = await api(t, { response: (result) => {
      if (result.path === `/api/v1/user/catalog/products/${SKUS[0]}` && result.method === 'GET' && result.payload.data) {
        corrupt(result.payload.data); return { status: result.status, payload: result.payload };
      }
    } });
    await assert.rejects(run(), /CATALOG_VERIFICATION_FAILED/);
  });
  await t.test('corrupt create response', async (t) => {
    const { state, run } = await api(t, { response: (result) => {
      if (result.path === `/api/v1/user/catalog/products/${SKUS[0]}` && result.method === 'PUT') {
        result.payload.data.name = 'Wrong name'; return { status: result.status, payload: result.payload };
      }
    } });
    await assert.rejects(run(), /CATALOG_VERIFICATION_FAILED/);
    assert.equal(state.customer, null, 'reject corrupted create before customer mutations');
  });
});

test('optional pending order remains optional and existing customer collections are preserved', async (t) => {
  const { state, run } = await api(t, { includePendingOrder: false, prepare: (state) => {
    state.customer = { id: 42, email: 'showcase.customer@storecore.invalid', firstName: 'Operator', lastName: 'Edited', phone: null,
      state: domain.ShowcaseCustomerState.Active.wire, createdAt: '2026-01-01T00:00:00Z', orderCount: 0, lastOrderAt: null };
    state.addresses = [{ id: 9, revision: '2026-01-01T00:00:00Z', street: 'Operator', number: '1', isDefault: true }];
    state.cart = { lines: [{ sku: 'OPERATOR', quantity: 10 }] };
    state.modules.push({ module: 'UNRELATED_FUTURE', state: 'future', configVersion: 1 });
  } });
  await run(); assert.equal(state.orders.length, 0);
  assert.equal(state.addresses.length, 1); assert.equal(state.addresses[0].street, 'Operator');
  assert.deepEqual(state.cart.lines, [{ sku: 'OPERATOR', quantity: 10 }]);
});

test('corrupt mutation/readback identities and closed values fail loader verification', async (t) => {
  const cases = [
    ['favorite outcome', '/api/v1/customer/favorites/SHOW-TALADRO-18V', 'PUT', (data) => { data.outcome = 'future'; }],
    ['favorite sku', '/api/v1/customer/favorites/SHOW-TALADRO-18V', 'PUT', (data) => { data.sku = 'OTHER'; }],
    ['favorite availability', '/api/v1/customer/favorites', 'GET', (data) => { if (data.length) data[0].availability = 'future'; }],
    ['favorite missing price', '/api/v1/customer/favorites', 'GET', (data) => { if (data.length) delete data[0].price; }],
    ['favorite missing timestamp', '/api/v1/customer/favorites', 'GET', (data) => { if (data.length) delete data[0].addedAt; }],
    ['offer status', '/api/v1/user/offers', 'POST', (data) => { data.status = 'future'; }],
    ['offer scope', '/api/v1/user/offers', 'POST', (data) => { data.skus = ['OTHER']; }],
    ['offer discount', '/api/v1/user/offers', 'POST', (data) => { data.discountValue = null; }],
    ['offer wrong valid discount', '/api/v1/user/offers', 'POST', (data) => { data.discountValue = 9; }],
    ['offer window', '/api/v1/user/offers', 'POST', (data) => { data.endsAt = data.startsAt; }],
    ['customer state', '/api/v1/user/customers/42', 'GET', (data) => { data.state = 'future'; }],
    ['customer id', '/api/v1/user/customers/42', 'GET', (data) => { data.id = 99; }],
    ['customer email', '/api/v1/user/customers/42', 'GET', (data) => { data.email = 'OTHER'; }],
    ['receipt identity', '/api/v1/customer/checkout', 'POST', (data) => { delete data.orderId; }],
    ['order lines', '/api/v1/customer/orders/601', 'GET', (data) => { data.lines[0].sku = 'OTHER'; }],
    ['cart quantity', '/api/v1/customer/cart', 'GET', (data) => { data.lines.forEach((line) => { line.quantity = 99; }); }],
    ['overview timezone', '/api/v1/user/overview', 'GET', (data) => { data.timezone = 'garbage'; }],
    ['overview period', '/api/v1/user/overview', 'GET', (data) => { data.period = 'future'; }],
    ['overview fact', '/api/v1/user/overview', 'GET', (data) => { data.orderCount.value = null; }],
    ['overview queue', '/api/v1/user/overview', 'GET', (data) => { data.pendingPayments.truncated = true; }],
    ['overview reason', '/api/v1/user/overview', 'GET', (data) => { data.pendingPayments = { state: domain.ShowcaseFactState.Unavailable.wire, items: [], totalCount: null, truncated: false, reason: 'future' }; }],
  ];
  for (const [name, path, method, corrupt] of cases) await t.test(name, async (t) => {
    const { run } = await api(t, { response: (result) => {
      if (result.path !== path || result.method !== method) return;
      corrupt(result.payload.data); return { status: result.status, payload: result.payload };
    } });
    await assert.rejects(run(), /SHOWCASE_.*VERIFICATION_FAILED/);
  });
});

test('overview accepts genuine unavailable facts and rejects contradictory/unknown queue items', () => {
  const unavailable = overview();
  unavailable.accreditedRevenue = { state: domain.ShowcaseFactState.Unavailable.wire, value: null, reason: domain.ShowcaseUnavailableReason.Payment.wire };
  unavailable.fulfillment = { state: domain.ShowcaseFactState.Unavailable.wire, items: [], totalCount: null, truncated: false, reason: domain.ShowcaseUnavailableReason.Shipment.wire };
  assert.equal(domain.requireOverview(unavailable), unavailable);
  for (const mutate of [
    (data) => { data.orderCount.state = 'future'; },
    (data) => { data.orderCount.reason = domain.ShowcaseUnavailableReason.Payment.wire; },
    (data) => { data.fulfillment.items.push({ orderId: 1, orderNumber: 'SC-1', total: 1, paidAt: '2026-01-01T00:00:00Z', shipmentState: 'future' }); data.fulfillment.totalCount = 1; },
    (data) => { data.pendingPayments.items.push({ orderId: 1, orderNumber: 'SC-1', total: 1, createdAt: '2026-01-01T00:00:00Z', reason: 'future' }); data.pendingPayments.totalCount = 1; },
    (data) => { data.lowStock.totalCount = -1; },
  ]) { const data = overview(); mutate(data); assert.throws(() => domain.requireOverview(data), /VERIFICATION_FAILED/); }
});

test('manual policy opt-in uses exact baseline CAS and refuses operator drift without a write', async(t)=>{
  const policy={pickup:{enabled:true,label:'Retiro fixture',cost:'0.00',minDays:0,maxDays:1,destination:'Local fixture',instructions:'Presentar confirmación'},localDelivery:{enabled:true,label:'Entrega fixture',cost:'0.00',minDays:1,maxDays:2}};
  const first=await api(t,{manualFulfillmentPolicy:policy,prepare:state=>{state.modules.find(row=>row.module===ShowcaseCapability.ManualFulfillment.wire).configVersion=2;}});
  await first.run();
  const write=first.state.requests.find(row=>row.path.endsWith('/MANUAL_FULFILLMENT/policy'));
  assert.equal(write.body.expectedConfigVersion,2);
  assert.deepEqual(write.body.pickup,policy.pickup);
  const checkout=first.state.requests.find(row=>row.path.endsWith('/checkout'));
  assert.equal(checkout.body.deliveryMode,domain.ShowcaseDeliveryMode.LocalDelivery.wire);
  assert.equal(checkout.body.deliveryConfigurationVersion,4);
  const count=first.state.writes.length;
  await first.run();
  assert.equal(first.state.writes.length,count,'configured active policy is preserved during replay');
  const drift=await api(t,{manualFulfillmentPolicy:policy,prepare:state=>{const row=state.modules.find(row=>row.module===ShowcaseCapability.ManualFulfillment.wire);row.configVersion=3;}});
  await assert.rejects(drift.run(),/SHOWCASE_DELIVERY_POLICY_DRIFT/);
  assert.equal(drift.state.requests.filter(row=>row.path.startsWith('/api/v1/user/capabilities/')&&row.method!=='GET').length,0);
});
