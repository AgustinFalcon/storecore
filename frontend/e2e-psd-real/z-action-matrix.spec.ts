/* eslint-disable no-empty-pattern -- Playwright requires destructuring even for cases using only testInfo. */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { AccessContext } from '../src/app/domain/access/access-context';
import { readApiBody } from '../src/app/core/api/base-response';
import { DeliveryMode } from '../src/app/domain/cart/delivery';
import { CustomerAccountState, CustomerStateTransition } from '../src/app/domain/customer-admin/customer-admin';
import { OfferStatus, OfferTransition } from '../src/app/domain/offer/offer';
import { FulfillmentEligibility, OrderStatus, PaymentStatus, ShipmentTransition } from '../src/app/domain/order/commerce-states';
import { CapabilityModuleId } from '../src/app/domain/user/capability-module-id';
import { CapabilityModuleState } from '../src/app/domain/user/capability-module-state';
import { PolicyStatus, PolicyTransition, ChannelAvailability } from '../src/app/domain/user/channel-pricing';
import { MercadoLibreAccountStatus } from '../src/app/domain/user/mercadolibre-account-status';
import { UserRole } from '../src/app/domain/user/user-role';
import { mapAdminOrder, mapCart, mapCapabilities, mapProductDetail, mapProductSummaries } from '../src/app/data/mappers/http-mappers';
import { mapChannelAccount, mapPricePolicy } from '../src/app/data/user/channel-pricing.mapper';
import { RealRouteReceipt } from '../src/app/features/navigation/real-fixture-receipt';
import { RealActionCase, JourneyCustomer, WriteMethod, body, mutate, mutation } from './action-matrix-support';
import { origin } from './support';

let adminContext: BrowserContext;
let operatorContext: BrowserContext;
let receipt: RealRouteReceipt;

// A separate action suite executes once after the immutable route census. Each
// customer and every commercial entity belong to one journey, never the receipt.
test.beforeAll(async ({ browser }) => {
  receipt = RealRouteReceipt.fromWire(JSON.parse(readFileSync('psd-real-results/fixture-receipt.json', 'utf8')));
  const authDir = process.env['STORECORE_PSD_AUTH_DIR'];
  if (!authDir) throw new Error('Missing ephemeral action auth directory');
  for (const role of [UserRole.Admin, UserRole.Operator]) {
    const context = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true,
      storageState: join(authDir, `action-${role.wire}.json`) });
    if (role === UserRole.Admin) adminContext = context; else operatorContext = context;
    expect((await context.request.get('/api/v1/internal/me')).status()).toBe(200);
    expect((await context.request.get('/api/v1/customer/me')).status()).toBe(401);
  }
});
test.afterAll(async () => { await adminContext?.close(); await operatorContext?.close(); });

async function adminPage(): Promise<Page> {
  const page = await adminContext.newPage();
  await page.goto('/login');
  await expect(page).toHaveURL(/\/user\/home$/);
  return page;
}

test('PRM action: public catalog combines search brand category and active-offer filters against real data', async ({ browser }, info) => {
  RealActionCase.CatalogDiscovery.annotate(info);
  const admin = await adminPage();
  const context = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  try {
    const activated = await mutate(admin, AccessContext.User, `user/offers/${receipt.offerId}/state`,
      { transition: OfferTransition.Activate.wire });
    expect(activated.status()).toBe(200);

    const page = await context.newPage();
    await page.goto('/catalog');
    await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
    await page.getByLabel('Búsqueda', { exact: true }).fill('Taladro');
    await page.getByLabel('Marca', { exact: true }).selectOption({ label: 'Showcase Tools' });
    await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Herramientas eléctricas' });
    await page.getByLabel('Sólo ofertas', { exact: true }).check();
    const responsePromise = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/v1/catalog' && url.searchParams.get('query') === 'Taladro'
        && url.searchParams.has('brand') && url.searchParams.has('category') && url.searchParams.get('offers') === 'true';
    });
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const products = mapProductSummaries(readApiBody(await response.json()));
    expect(products.map(product => product.sku)).toEqual([receipt.products[0].sku]);
    await expect(page.getByRole('heading', { name: receipt.products[0].name, exact: true })).toBeVisible();
    await expect(page.getByText(receipt.products[1].name, { exact: true })).toHaveCount(0);
    expect((await context.cookies()).some(cookie => cookie.name.startsWith('__Host-storecore-'))).toBe(false);
  } finally {
    await context.close();
    await admin.close();
  }
});

test('PRM action: UI registration survives logout and subsequent login in CUSTOMER realm', async ({ browser }, info) => {
  RealActionCase.Registration.annotate(info);
  const context = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  try {
    const page = await context.newPage();
    const email = `prm-ui-${randomUUID()}@storecore.invalid`;
    const password = `PRM-${randomUUID()}!aA1`;
    await page.goto('/customer/register');
    await page.getByLabel('Nombre', { exact: true }).fill('Registro');
    await page.getByLabel('Apellido', { exact: true }).fill('Persistente');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    const created = mutation(page, 'customer/auth/register');
    await page.getByRole('button', { name: 'Registrarme', exact: true }).click();
    expect((await created).status()).toBe(201);
    await expect(page).toHaveURL(/\/customer\/profile$/);
    expect((await body<{ email: string }>(page, 'customer/me')).email).toBe(email);
    expect((await mutate(page, AccessContext.Customer, 'customer/auth/logout', {})).status()).toBe(200);
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    const loggedIn = mutation(page, 'auth/login');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    expect((await loggedIn).status()).toBe(200);
    await expect(page).not.toHaveURL(/\/login/);
    expect((await body<{ email: string }>(page, 'customer/me')).email).toBe(email);
    expect((await page.request.get('/api/v1/internal/me')).status()).toBe(401);
    const cookies = await context.cookies();
    expect(cookies.find(cookie => cookie.name === '__Host-storecore-customer')).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(cookies.some(cookie => cookie.name === '__Host-storecore-internal')).toBe(false);
  } finally { await context.close(); }
});

test('PRM action: profile update persists after reload', async ({ browser }, info) => {
  RealActionCase.Profile.annotate(info);
  const customer = await JourneyCustomer.create(browser);
  try {
    const page = customer.page;
    await page.goto('/customer/profile');
    await page.getByLabel('Nombre', { exact: true }).fill('Nombre persistente');
    await page.getByLabel('Teléfono', { exact: true }).fill('1133334444');
    const saved = mutation(page, 'customer/me', WriteMethod.Put);
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByRole('status').filter({ hasText: 'Perfil actualizado' })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Nombre persistente');
    expect(await body(page, 'customer/me')).toMatchObject({ firstName: 'Nombre persistente', phone: '1133334444' });
  } finally { await customer.close(); }
});

test('PRM action: addresses create edit delete and foreign ownership reject persistently', async ({ browser }, info) => {
  RealActionCase.Addresses.annotate(info);
  const owner = await JourneyCustomer.create(browser);
  const stranger = await JourneyCustomer.create(browser);
  try {
    const page = owner.page;
    await page.goto('/customer/addresses');
    for (const [label, value] of [['Calle', 'PRM propia'], ['Número', '42'], ['Ciudad', 'Ciudad'], ['Provincia', 'Provincia'], ['CP', '1000']]) {
      await page.getByLabel(label, { exact: true }).fill(value);
    }
    const created = mutation(page, 'customer/me/addresses');
    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    expect((await created).status()).toBe(200);
    const addresses = await body<{ id: string; street: string }[]>(page, 'customer/me/addresses');
    expect(addresses).toHaveLength(1);
    const id = String(addresses[0].id);
    const before = await body(page, 'customer/me/addresses');
    expect((await mutate(stranger.page, AccessContext.Customer, `customer/me/addresses/${id}`, {}, WriteMethod.Delete)).status()).toBe(404);
    expect((await mutate(stranger.page, AccessContext.Customer, `customer/me/addresses/${id}`, {
      street: 'Ajena', number: '1', city: 'Ciudad', province: 'Provincia', postalCode: '1000', isDefault: true,
    }, WriteMethod.Put)).status()).toBe(404);
    expect(await body(page, 'customer/me/addresses')).toEqual(before);
    expect(await body(stranger.page, 'customer/me/addresses')).toEqual([]);
    await page.reload();
    await page.getByRole('button', { name: /PRM propia 42/ }).click();
    await page.getByLabel('Calle', { exact: true }).fill('PRM editada');
    const edited = mutation(page, `customer/me/addresses/${id}`, WriteMethod.Put);
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    expect((await edited).status()).toBe(200);
    await page.reload();
    await expect(page.getByRole('button', { name: /PRM editada 42/ })).toBeVisible();
    expect((await body<{ street: string }[]>(page, 'customer/me/addresses'))[0].street).toBe('PRM editada');
    const deleted = mutation(page, `customer/me/addresses/${id}`, WriteMethod.Delete);
    await page.getByRole('button', { name: 'Quitar', exact: true }).click();
    expect((await deleted).status()).toBe(200);
    await page.reload();
    expect(await body(page, 'customer/me/addresses')).toEqual([]);
    await expect(page.locator('.sc-address-list li')).toHaveCount(0);
  } finally { await owner.close(); await stranger.close(); }
});

test('PRM action: favorite add and remove persist for its own customer', async ({ browser }, info) => {
  RealActionCase.Favorites.annotate(info);
  const customer = await JourneyCustomer.create(browser);
  try {
    const page = customer.page;
    const product = receipt.products[0];
    await page.goto(`/catalog/${encodeURIComponent(product.sku)}`);
    const saved = mutation(page, `customer/favorites/${encodeURIComponent(product.sku)}`, WriteMethod.Put);
    await page.getByRole('button', { name: /Guardar en favoritos/ }).click();
    expect((await saved).status()).toBe(200);
    await page.goto('/customer/favorites');
    await page.reload();
    await expect(page.locator('.sc-favorite-card')).toHaveCount(1);
    expect(await body(page, 'customer/favorites')).toMatchObject([{ sku: product.sku }]);
    const removed = mutation(page, `customer/favorites/${encodeURIComponent(product.sku)}`, WriteMethod.Delete);
    await page.getByRole('button', { name: 'Quitar', exact: true }).click();
    expect((await removed).status()).toBe(200);
    await page.reload();
    expect(await body(page, 'customer/favorites')).toEqual([]);
    await expect(page.locator('.sc-favorite-card')).toHaveCount(0);
  } finally { await customer.close(); }
});

test('PRM action: cart checkout preserves authoritative revisions and rejects foreign order reads', async ({ browser }, info) => {
  RealActionCase.Checkout.annotate(info);
  const owner = await JourneyCustomer.create(browser);
  const stranger = await JourneyCustomer.create(browser);
  try {
    const page = owner.page;
    const product = receipt.products[0];
    await page.goto(`/catalog/${encodeURIComponent(product.sku)}`);
    const added = mutation(page, 'customer/cart/items', WriteMethod.Put);
    await page.getByRole('button', { name: 'Agregar al carrito', exact: true }).click();
    expect((await added).status()).toBe(200);
    await page.goto('/cart');
    const changed = mutation(page, 'customer/cart/items', WriteMethod.Put);
    await page.getByRole('button', { name: /^Agregar una unidad de / }).click();
    expect((await changed).status()).toBe(200);
    await page.reload();
    const cart = mapCart(await body(page, 'customer/cart'));
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0].quantity).toBe(2);
    const authoritative = mapProductDetail(await body(page, `catalog/products/${encodeURIComponent(product.sku)}`));
    expect(cart.lines[0].effectiveUnitPrice).toBe(authoritative.price?.effective);
    await page.goto('/checkout');
    const pickup = cart.deliveryOptions?.find(option => option.mode === DeliveryMode.Pickup);
    expect(pickup?.known).toBe(true);
    if (!pickup) throw new Error('Missing configured local pickup');
    await page.getByRole('radio', { name: new RegExp(pickup.label) }).check();
    const checkout = mutation(page, 'customer/checkout');
    await page.getByRole('button', { name: 'Pagar', exact: true }).click();
    const response = await checkout;
    expect(response.status()).toBe(200);
    const command = response.request().postDataJSON();
    expect(command.cartRevision).toBe(cart.revision);
    expect(DeliveryMode.fromWire(command.deliveryMode)).toBe(DeliveryMode.Pickup);
    expect(command.deliveryConfigurationVersion).toBe(pickup.configurationVersion);
    const result = readApiBody<{ orderId: string; orderStatus: unknown; paymentStatus: unknown }>(await response.json());
    expect(OrderStatus.fromWire(result.orderStatus)).toBe(OrderStatus.PendingPayment);
    expect(PaymentStatus.fromWire(result.paymentStatus)).toBe(PaymentStatus.Pending);
    const id = String(result.orderId);
    await expect(page).toHaveURL(new RegExp(`/checkout/result/${id}$`));
    const persisted = await body(page, `customer/orders/${id}`);
    await page.reload();
    expect(await body(page, `customer/orders/${id}`)).toEqual(persisted);
    await page.goto('/customer/orders');
    await expect(page.getByRole('link', { name: id, exact: true })).toBeVisible();
    await page.getByRole('link', { name: id, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/customer/orders/${id}$`));
    expect((await stranger.page.request.get(`/api/v1/customer/orders/${id}`)).status()).toBe(404);
    expect(await body(stranger.page, 'customer/orders')).toMatchObject({ items: [] });
    expect(await body(page, `customer/orders/${id}`)).toEqual(persisted);
  } finally { await owner.close(); await stranger.close(); }
});

test('PRM action: unpaid receipt order blocks UI fulfillment and backend transition without effects', async ({}, info) => {
  RealActionCase.Pending.annotate(info);
  const page = await adminPage();
  try {
    const id = receipt.pendingOrderId;
    const before = await body(page, `user/orders/${id}`);
    const order = mapAdminOrder(before);
    expect(order.fulfillmentEligibility).toBe(FulfillmentEligibility.OrderNotPaid);
    expect(order.paymentStatus).toBe(PaymentStatus.Pending);
    await page.goto(`/user/orders/${id}`);
    await expect(page.getByRole('button', { name: ShipmentTransition.Packed.label, exact: true })).toHaveCount(0);
    const rejected = await mutate(page, AccessContext.User, `user/orders/${id}/shipments`, { status: ShipmentTransition.Packed.wire });
    expect(rejected.status()).toBe(400);
    expect(await body(page, `user/orders/${id}`)).toEqual(before);
    await page.reload();
    expect(mapAdminOrder(await body(page, `user/orders/${id}`)).fulfillmentEligibility).toBe(FulfillmentEligibility.OrderNotPaid);
  } finally { await page.close(); }
});

async function createProduct(page: Page): Promise<string> {
  const sku = `000-PRM-${randomUUID()}`;
  await page.goto('/user/catalog');
  await page.getByRole('button', { name: 'Nuevo producto', exact: true }).click();
  await page.locator('input[name="sku"]').fill(sku);
  await page.locator('input[name="name"]').fill(sku);
  await page.locator('input[name="variantName-0"]').fill(sku);
  await page.getByLabel('Stock inicial', { exact: true }).fill('10');
  await page.getByLabel('Precio base', { exact: true }).fill('100');
  const saved = mutation(page, `user/catalog/products/${sku}`, WriteMethod.Put);
  await page.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  expect((await saved).status()).toBe(200);
  return sku;
}

test('PRM action: real product creation variant editing and authorized inventory adjustment survive reload', async ({}, info) => {
  RealActionCase.Catalog.annotate(info);
  const page = await adminPage();
  try {
    const sku = await createProduct(page);
    await page.reload();
    await page.getByRole('button', { name: sku, exact: true }).click();
    await expect(page.getByLabel('Stock inicial', { exact: true })).toHaveCount(0);
    await page.locator('input[name="variantName-0"]').fill('Variante persistida');
    const updated = mutation(page, `user/catalog/products/${sku}`, WriteMethod.Put);
    await page.getByRole('button', { name: 'Guardar producto', exact: true }).click();
    expect((await updated).status()).toBe(200);
    const persisted = mapProductDetail(await body(page, `catalog/products/${sku}`));
    expect(persisted.variants[0].name).toBe('Variante persistida');
    const variantId = persisted.variants[0].id;
    await page.goto('/user/inventory');
    const trigger = page.getByRole('button', { name: `Ajustar disponible de ${sku}`, exact: true });
    await trigger.click();
    await page.getByLabel('Variación de disponible', { exact: true }).fill('-1');
    await page.getByLabel('Motivo del ajuste', { exact: true }).fill('Conteo PRM aislado');
    await page.getByRole('button', { name: 'Revisar ajuste', exact: true }).click();
    const adjusted = mutation(page, `user/inventory/${variantId}/adjustments`);
    await page.getByRole('button', { name: 'Confirmar ajuste', exact: true }).click();
    const response = await adjusted;
    expect(response.status()).toBe(200);
    const command = response.request().postDataJSON();
    const applied = await body(page, `user/inventory/${variantId}/adjustments/${command.commandId}`);
    await page.reload();
    expect(await body(page, `user/inventory/${variantId}/adjustments/${command.commandId}`)).toEqual(applied);
    expect(mapProductDetail(await body(page, `catalog/products/${sku}`)).variants[0].availableQuantity).toBe(9);
  } finally { await page.close(); }
});

test('PRM action: local offer draft and transition have durable readback', async ({}, info) => {
  RealActionCase.Offers.annotate(info);
  const page = await adminPage();
  try {
    const name = `PRM-${randomUUID()}`;
    await page.goto('/user/offers');
    await page.getByLabel('Nombre', { exact: true }).fill(name);
    await page.getByLabel('SKU de referencia', { exact: false }).fill(receipt.products[0].sku);
    const created = mutation(page, 'user/offers');
    await page.getByRole('button', { name: 'Crear borrador', exact: true }).click();
    expect((await created).status()).toBe(201);
    const offer = page.locator('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
    await expect(offer).toContainText(OfferStatus.Draft.label);
    await offer.getByRole('button', { name: OfferTransition.End.label, exact: true }).click();
    await page.locator('[data-confirm-transition]').click();
    await expect(offer).toContainText(OfferStatus.Ended.label);
    await page.reload();
    await expect(offer).toContainText(OfferStatus.Ended.label);
    const rows = await body<{ name: string; status: unknown }[]>(page, 'user/offers');
    expect(OfferStatus.fromWire(rows.find(row => row.name === name)?.status)).toBe(OfferStatus.Ended);
  } finally { await page.close(); }
});

test('PRM action: manual price policy draft activation and pause persist locally', async ({}, info) => {
  RealActionCase.Promos.annotate(info);
  const page = await adminPage();
  try {
    const sku = await createProduct(page);
    await page.goto('/user/promos');
    await page.getByLabel('SKU', { exact: true }).fill(sku);
    await page.getByLabel('Precio deseado local', { exact: true }).fill('95');
    // datetime-local is interpreted in the browser timezone. Wide window avoids
    // depending on local timezone while remaining active at the server instant.
    await page.getByLabel('Desde', { exact: true }).fill(new Date(Date.now() - 86_400_000).toISOString().slice(0, 16));
    await page.getByLabel('Hasta', { exact: true }).fill(new Date(Date.now() + 86_400_000).toISOString().slice(0, 16));
    const created = mutation(page, 'user/promos');
    await page.getByRole('button', { name: 'Crear borrador', exact: true }).click();
    const response = await created;
    expect(response.status()).toBe(200);
    const draft = mapPricePolicy(readApiBody(await response.json()));
    expect(draft.status).toBe(PolicyStatus.Draft);
    const card = page.locator('article').filter({ has: page.getByRole('heading', { name: sku, exact: true }) });
    for (const [transition, expected] of [[PolicyTransition.Activate, PolicyStatus.Active], [PolicyTransition.Pause, PolicyStatus.Paused]] as const) {
      const changed = mutation(page, `user/promos/${draft.id}/state`);
      await card.getByRole('button', { name: transition.label, exact: true }).click();
      expect((await changed).status()).toBe(200);
      await expect(card).toContainText(expected.label);
      await page.reload();
      await expect(card).toContainText(expected.label);
      const rows = await body<{ items: unknown[] }>(page, 'user/promos');
      const persisted = rows.items.map(mapPricePolicy).find(row => row.id === draft.id);
      expect(persisted?.status).toBe(expected);
      expect(persisted?.approvedBy).toBeTruthy();
    }
  } finally { await page.close(); }
});

test('PRM action: branding publishes publicly and stale revision cannot overwrite it', async ({}, info) => {
  RealActionCase.Branding.annotate(info);
  const page = await adminPage();
  try {
    const before = await body<{ revision: number }>(page, 'user/settings/branding');
    await page.goto('/user/settings');
    const name = `PRM comercio ${randomUUID().slice(0, 8)}`;
    await page.getByLabel('Nombre del comercio', { exact: true }).fill(name);
    const saved = mutation(page, 'user/settings/branding', WriteMethod.Put);
    await page.getByRole('button', { name: 'Publicar apariencia', exact: true }).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    const confirmed = await body(page, 'user/settings/branding');
    const stale = { ...response.request().postDataJSON(), expectedRevision: before.revision, businessName: 'No debe sobrescribir' };
    expect((await mutate(page, AccessContext.User, 'user/settings/branding', stale, WriteMethod.Put)).status()).toBe(409);
    expect(await body(page, 'user/settings/branding')).toEqual(confirmed);
    await page.reload();
    await expect(page.getByLabel('Nombre del comercio', { exact: true })).toHaveValue(name);
    await page.goto('/');
    await expect(page.locator('sc-shell')).toContainText(name);
    expect(await body(page, 'storefront/branding')).toMatchObject({ businessName: name });
  } finally { await page.close(); }
});

test('PRM action: content publication persists and appears in public composition', async ({}, info) => {
  RealActionCase.Content.annotate(info);
  const page = await adminPage();
  try {
    const title = `PRM portada ${randomUUID().slice(0, 8)}`;
    await page.goto('/user/content');
    await page.getByLabel('Título', { exact: true }).first().fill(title);
    const saved = mutation(page, 'user/content/home', WriteMethod.Put);
    await page.getByRole('button', { name: 'Publicar cambios', exact: true }).click();
    expect((await saved).status()).toBe(200);
    const confirmed = await body(page, 'user/content/home');
    await page.reload();
    await expect(page.getByLabel('Título', { exact: true }).first()).toHaveValue(title);
    expect(await body(page, 'user/content/home')).toEqual(confirmed);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    expect(JSON.stringify(await body(page, 'content/home'))).toContain(title);
  } finally { await page.close(); }
});

test('PRM action: profile import rejects incompatible version and explicit compatible merge persists', async ({}, info) => {
  RealActionCase.Import.annotate(info);
  const page = await adminPage();
  try {
    const key = `prm_${randomUUID().replaceAll('-', '')}`;
    const title = `Perfil PRM ${key}`;
    const manifest = { profile_name: key, profile_version: '1.0.0', coreCompatibility: '1.x',
      content: { homeSections: [{ sectionKey: key, content: { title }, active: false, sortOrder: 100 }] } };
    await page.goto('/user/profile-import');
    const editor = page.getByLabel('Contenido del perfil', { exact: true });
    await editor.fill(JSON.stringify({ ...manifest, coreCompatibility: '999.x' }));
    const incompatible = mutation(page, 'user/profiles/preview');
    await page.getByRole('button', { name: 'Previsualizar manifiesto', exact: true }).click();
    expect((await incompatible).status()).toBe(200);
    await expect(page.getByText('Incompatible', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Revisar confirmación', exact: true })).toBeDisabled();
    await editor.fill(JSON.stringify(manifest));
    await page.getByRole('button', { name: 'Previsualizar manifiesto', exact: true }).click();
    await page.getByLabel(`Seleccionar sección ${key}`, { exact: true }).check();
    await page.getByRole('button', { name: 'Previsualizar manifiesto', exact: true }).click();
    const trigger = page.getByRole('button', { name: 'Revisar confirmación', exact: true });
    await trigger.click();
    await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await trigger.click();
    const merged = mutation(page, 'user/profiles/merge');
    await page.getByRole('button', { name: 'Confirmar importación', exact: true }).click();
    expect((await merged).status()).toBe(200);
    await expect(page.getByText('Importación aplicada', { exact: true })).toBeVisible();
    const confirmed = await body<{ sections: { key: string; content: { title: string } }[] }>(page, 'user/content/home');
    expect(confirmed.sections.find(section => section.key === key)?.content.title).toBe(title);
    await page.reload();
    expect(await body(page, 'user/content/home')).toEqual(confirmed);
  } finally { await page.close(); }
});

test('PRM action: ADMIN suspension revokes old session permanently through reactivation', async ({ browser }, info) => {
  RealActionCase.Suspension.annotate(info);
  const customer = await JourneyCustomer.create(browser);
  const page = await adminPage();
  try {
    const id = String((await body<{ id: number }>(customer.page, 'customer/me')).id);
    await page.goto('/user/customers');
    await page.getByLabel('Buscar cliente', { exact: true }).fill(customer.email);
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await page.getByRole('row').filter({ hasText: customer.email }).getByRole('button', { name: 'Ver detalle', exact: true }).click();
    for (const transition of [CustomerStateTransition.Suspend, CustomerStateTransition.Reactivate]) {
      await page.getByRole('button', { name: transition.label, exact: true }).click();
      const changed = mutation(page, `user/customers/${id}/state`);
      await page.locator('[data-confirm-customer]').click();
      expect((await changed).status()).toBe(200);
      expect((await customer.page.request.get('/api/v1/customer/me')).status()).toBe(401);
      const persisted = await body<{ state: unknown }>(page, `user/customers/${id}`);
      expect(CustomerAccountState.fromWire(persisted.state)).toBe(transition.target);
    }
    await page.reload();
    const persisted = await body<{ state: unknown }>(page, `user/customers/${id}`);
    expect(CustomerAccountState.fromWire(persisted.state)).toBe(CustomerStateTransition.Reactivate.target);
    expect((await customer.page.request.get('/api/v1/customer/me')).status()).toBe(401);
  } finally { await page.close(); await customer.close(); }
});

test('PRM action: OPERATOR read permissions CSRF separation and realm logout fail closed', async ({ browser }, info) => {
  RealActionCase.Permissions.annotate(info);
  const customer = await JourneyCustomer.create(browser);
  const page = await operatorContext.newPage();
  try {
    await page.goto('/user/customers');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const id = String((await body<{ id: number }>(customer.page, 'customer/me')).id);
    const before = await body(page, `user/customers/${id}`);
    expect((await mutate(page, AccessContext.User, `user/customers/${id}/state`, { state: CustomerStateTransition.Suspend.target.wire })).status()).toBe(403);
    expect(await body(page, `user/customers/${id}`)).toEqual(before);
    for (const path of ['user/offers', 'user/promos', 'user/settings/branding', 'user/profiles/preview']) {
      const response = path.endsWith('/preview') ? await mutate(page, AccessContext.User, path, { manifest: '{}' }) : await page.request.get(`/api/v1/${path}`);
      expect(response.status(), `OPERATOR denied ${path}`).toBe(403);
    }
    await page.goto('/user/capabilities');
    await expect(page.getByRole('button', { name: /^Cambiar estado de / })).toHaveCount(0);
    const modules = mapCapabilities(await body(page, 'user/capabilities'));
    const local = modules.find(row => row.id === CapabilityModuleId.ManualPromotions);
    expect(local).toBeTruthy();
    expect((await mutate(page, AccessContext.User, `user/capabilities/${CapabilityModuleId.ManualPromotions.wire}/state`, {
      state: CapabilityModuleState.Paused.wire, expectedConfigVersion: local?.configVersion, reason: 'Denied operator', correlationId: randomUUID(),
    })).status()).toBe(403);
    expect(mapCapabilities(await body(page, 'user/capabilities'))).toEqual(modules);
    const foreign = await customer.page.request.get('/api/v1/customer/auth/csrf');
    expect(foreign.status()).toBe(200);
    expect((await page.request.post('/api/v1/internal/auth/logout', { headers: { Origin: origin,
      'X-CSRF-Token': foreign.headers()['x-csrf-token']! }, data: {} })).status()).toBe(403);
    expect((await page.request.get('/api/v1/internal/me')).status()).toBe(200);
    expect((await customer.page.request.put('/api/v1/customer/me', { headers: { Origin: origin },
      data: { firstName: 'Missing csrf', lastName: 'Rejected', email: customer.email } })).status()).toBe(403);
    expect((await body<{ firstName: string }>(customer.page, 'customer/me')).firstName).toBe('PRM');
    expect((await mutate(customer.page, AccessContext.Customer, 'customer/auth/logout', {})).status()).toBe(200);
    expect((await customer.page.request.get('/api/v1/customer/me')).status()).toBe(401);
    expect((await page.request.get('/api/v1/internal/me')).status()).toBe(200);
  } finally { await page.close(); await customer.close(); }
});

test('PRM action: external account and capabilities honestly remain unavailable', async ({}, info) => {
  RealActionCase.External.annotate(info);
  const page = await adminPage();
  try {
    await page.goto('/user/mercadolibre');
    const account = mapChannelAccount(await body(page, 'user/mercadolibre/account'));
    expect(account.status).toBe(MercadoLibreAccountStatus.Unknown);
    expect(account.availability).toBe(ChannelAvailability.Unavailable);
    expect(account.accountRef).toBeNull();
    await expect(page.getByText(account.status.label, { exact: true })).toBeVisible();
    await expect(page.getByText('Estado local registrado: no certifica autorización OAuth ni disponibilidad del proveedor.', { exact: true })).toBeVisible();
    const listings = await body<{ items: unknown[]; total: number }>(page, 'user/mercadolibre/listings');
    expect(listings.items).toEqual([]);
    expect(listings.total).toBe(0);
    await page.goto('/user/capabilities');
    const modules = mapCapabilities(await body(page, 'user/capabilities'));
    for (const id of [CapabilityModuleId.PaymentsMp, CapabilityModuleId.MarketplaceMl, CapabilityModuleId.Carriers,
      CapabilityModuleId.MlPriceAutomation, CapabilityModuleId.MlCompetitionInsights, CapabilityModuleId.MlPromotionOrchestrator]) {
      const row = modules.find(row => row.id === id);
      expect(row, `External module must be present: ${id.label}`).toBeTruthy();
      expect(row?.state).toBe(CapabilityModuleState.Disabled);
    }
    await expect(page.getByText('Configuración local.', { exact: true })).toBeVisible();
  } finally { await page.close(); }
});

test('PRM action: permitted local capability commands persist without activating external integrations', async ({}, info) => {
  RealActionCase.Capability.annotate(info);
  const page = await adminPage();
  try {
    await page.goto('/user/capabilities');
    const module = CapabilityModuleId.ManualPromotions;
    const before = mapCapabilities(await body(page, 'user/capabilities')).find(row => row.id === module);
    expect(before?.state).toBe(CapabilityModuleState.Active);
    for (const state of [CapabilityModuleState.ReadOnly, CapabilityModuleState.Active]) {
      const trigger = page.getByRole('button', { name: `Cambiar estado de ${module.label}`, exact: true });
      await trigger.click();
      await page.getByLabel('Nuevo estado', { exact: true }).selectOption({ label: state.label });
      await page.getByLabel('Motivo (1 a 500 caracteres)', { exact: true }).fill('Verificación local PRM');
      const changed = mutation(page, `user/capabilities/${module.wire}/state`);
      await page.getByRole('button', { name: 'Confirmar cambio', exact: true }).click();
      expect((await changed).status()).toBe(200);
      const persisted = mapCapabilities(await body(page, 'user/capabilities')).find(row => row.id === module);
      expect(persisted?.state).toBe(state);
      await page.reload();
      expect(mapCapabilities(await body(page, 'user/capabilities')).find(row => row.id === module)?.state).toBe(state);
    }
  } finally { await page.close(); }
});

test('PRM action contract: closed cases reject unknown actions and all strict journeys are declared once', async () => {
  expect(RealActionCase.fromWire('future')).toBe(RealActionCase.Unknown);
  expect(new Set(RealActionCase.all.map(row => row.id)).size).toBe(RealActionCase.all.length);
  for (const row of RealActionCase.all) {
    expect(RealActionCase.fromWire(row.id)).toBe(row);
    expect(row.routes.length).toBeGreaterThan(0);
  }
});
