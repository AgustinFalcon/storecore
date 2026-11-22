import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.STORECORE_PRESENTATION_FRONTEND ?? 'http://127.0.0.1:4200';
const output = resolve(process.env.STORECORE_PRESENTATION_BROWSER_RESULTS ?? 'ua-real-results/presentation-persistent/browser');
const adminEmail = process.env.STORECORE_PRESENTATION_ADMIN_EMAIL;
const adminPassword = process.env.STORECORE_PRESENTATION_ADMIN_PASSWORD;
const customerEmail = process.env.STORECORE_PRESENTATION_CUSTOMER_EMAIL ?? 'demo.cliente.01@storecore.invalid';
const customerPassword = process.env.STORECORE_PRESENTATION_CUSTOMER_PASSWORD ?? 'StoreCore-demo-volume-2026!';
if (!adminEmail || !adminPassword) throw new Error('PRESENTATION_BROWSER_ADMIN_CREDENTIALS_REQUIRED');
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
async function actor(label, loginPath, credentials, routes) {
  const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { Origin: baseUrl } });
  const failures = [];
  const page = await context.newPage();
  page.on('response', response => {
    const expectedOppositeRealmProbe = response.status() === 401 && (label === 'admin'
      ? response.url().endsWith('/api/v1/customer/me') : response.url().endsWith('/api/v1/internal/me'));
    const expectedUnconfiguredExternal = label === 'admin' && response.status() === 409 && response.url().includes('/api/v1/user/mercadolibre/');
    if (response.url().startsWith(`${baseUrl}/api/`) && response.status() >= 400 && !expectedOppositeRealmProbe && !expectedUnconfiguredExternal) failures.push(`${response.status()} ${response.url()}`);
  });
  const login = await context.request.post(loginPath, { data: credentials, headers: { Origin: baseUrl } });
  assert.equal(login.status(), 200, `${label} login failed: ${login.status()}`);
  for (const route of routes) {
    const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200, `${label} ${route.path} document failed`);
    await page.waitForTimeout(750);
    if (route.ready) await page.locator(route.ready).first().waitFor({ state: 'visible', timeout: 10_000 });
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
    assert.ok(body.length >= (route.minText ?? 120), `${label} ${route.path} rendered an empty surface at ${page.url()}: ${body.slice(0, 240)}`);
    assert.ok(!/página no encontrada|ocurrió un error inesperado/i.test(body), `${label} ${route.path} rendered an error surface`);
    for (const expected of route.expected) assert.match(body, expected, `${label} ${route.path} missing presentation evidence`);
    results.push({ actor: label, path: route.path, title: await page.title(), textCharacters: body.length });
  }
  assert.deepEqual(failures, [], `${label} produced failed API responses`);
  await page.screenshot({ path: resolve(output, `${label}.png`), fullPage: true });
  await context.close();
}

try {
  await actor('admin', '/api/v1/internal/auth/login', { email: adminEmail, password: adminPassword }, [
    { path: '/user/home', expected: [/operaciones|panel|ventas/i] },
    { path: '/user/account', expected: [/cuenta|email|correo/i] },
    { path: '/user/settings', expected: [/apariencia|marca|tienda/i] },
    { path: '/user/catalog', expected: [/catálogo/i, /producto/i] },
    { path: '/user/inventory', expected: [/inventario|stock/i] },
    { path: '/user/customers', expected: [/clientes/i, /Martina|Pereyra/i] },
    { path: '/user/orders', expected: [/pedidos|órdenes|fulfillment/i] },
    { path: '/user/orders/38', expected: [/pedido|fulfillment|entrega/i] },
    { path: '/user/offers', expected: [/ofertas/i] },
    { path: '/user/promos', expected: [/promos|precios/i] },
    { path: '/user/content', expected: [/contenido/i] },
    { path: '/user/mercadolibre', expected: [/Mercado Libre/i] },
    { path: '/user/capabilities', expected: [/capabilities|módulos/i] },
    { path: '/user/profile-import', expected: [/perfil|importar/i] },
  ]);
  await actor('customer', '/api/v1/customer/auth/login', { email: customerEmail, password: customerPassword }, [
    { path: '/', expected: [/ferretería|herramientas/i] },
    { path: '/catalog', ready: 'sc-product-tile', minText: 1000, expected: [/catálogo|productos/i, /taladro|amoladora|herramienta/i] },
    { path: '/catalog/SHOW-TALADRO-18V', expected: [/Taladro percutor inalámbrico 18V/i, /carrito/i] },
    { path: '/customer/favorites', expected: [/favoritos/i] },
    { path: '/cart', expected: [/carrito/i] },
    { path: '/checkout', expected: [/checkout|entrega|confirmar|pedido/i] },
    { path: '/customer/addresses', expected: [/direcciones/i, /San Martín|Belgrano|Sarmiento|Mitre|Rivadavia|General Paz|Independencia|Las Heras/i] },
    { path: '/customer/orders', expected: [/pedidos|órdenes/i] },
    { path: '/customer/orders/43', expected: [/pedido|pago|entrega/i] },
    { path: '/customer/profile', expected: [/perfil|Martina|Pereyra/i] },
  ]);
  console.log(JSON.stringify({ status: 'PASS', routes: results.length, results }, null, 2));
} finally {
  await browser.close();
}
