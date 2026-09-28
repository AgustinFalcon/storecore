/** StoreCore visual capture: mobile 390x844 and HD 1440x900. No 1280x720. */
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:4201';
const root = join(dirname(fileURLToPath(import.meta.url)), 'output');

const viewports = [
  { id: '390x844', width: 390, height: 844 },
  { id: '1440x900', width: 1440, height: 900 },
];

const anon = [
  ['01-home', '/'],
  ['02-catalog', '/catalog'],
  ['03-catalog-offers', '/catalog?offers=1'],
  ['04-product', '/catalog/SKU-100'],
  ['05-customer-session', '/customer/session'],
  ['06-customer-register', '/customer/register'],
  ['07-user-session', '/user/session'],
];
const customer = [
  ['08-cart', '/cart'],
  ['09-checkout', '/checkout'],
  ['09b-shipping-quote', '/checkout/shipping'],
  ['10-checkout-result', '/checkout/result/ord-1042'],
  ['11-profile', '/customer/profile'],
  ['12-addresses', '/customer/addresses'],
  ['13-favorites', '/customer/favorites'],
  ['14-orders', '/customer/orders'],
  ['15-order-detail', '/customer/orders/ord-1042'],
  ['15b-shipping-track', '/customer/orders/ord-1042/envio'],
  ['15c-receipt', '/customer/orders/ord-1042/comprobante'],
];
const operator = [
  ['16-content', '/user/content'],
  ['17-user-catalog', '/user/catalog'],
  ['18-promos', '/user/promos'],
  ['19-fulfillment', '/user/orders'],
  ['20-fulfillment-detail', '/user/orders/ord-1042'],
  ['21-inventory', '/user/inventory'],
  ['22-mercadolibre', '/user/mercadolibre'],
  ['23-capabilities', '/user/capabilities'],
  ['24-profile-import', '/user/profile-import'],
];

const failures = [];

async function shot(page, folder, name) {
  await page.waitForFunction(() => {
    const text = document.body?.innerText || '';
    return text.length > 40 && !text.includes('Cargando…') && !text.includes('Comprobando el API');
  }, null, { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(400);
  const file = join(root, folder, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const h1 = ((await page.locator('h1').first().textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  if (!h1) failures.push(`${folder} ${name}: sin h1`);
  if (width.scroll > width.client + 1) failures.push(`${folder} ${name}: ancho ${width.scroll} > ${width.client}`);
  console.log(folder, name, h1, width.scroll === width.client ? 'ancho ok' : `ancho ${width.scroll}`);
}

const browser = await chromium.launch({ headless: true });
for (const viewport of viewports) {
  const folder = viewport.id;
  await mkdir(join(root, folder), { recursive: true });
  const anonContext = await browser.newContext({ viewport });
  const anonPage = await anonContext.newPage();
  for (const [name, route] of anon) {
    await anonPage.goto(base + route, { waitUntil: 'domcontentloaded' });
    await shot(anonPage, folder, name);
  }
  await anonContext.close();

  const customerContext = await browser.newContext({ viewport });
  await customerContext.addCookies([{ name: 'sc_customer', value: '1', url: base }]);
  await customerContext.addInitScript(() => {
    sessionStorage.setItem('storecore.ui.favorites', JSON.stringify([{ sku: 'SKU-100', name: 'Lámpara de escritorio' }]));
  });
  const customerPage = await customerContext.newPage();
  for (const [name, route] of customer) {
    await customerPage.goto(base + route, { waitUntil: 'domcontentloaded' });
    await shot(customerPage, folder, name);
  }
  await customerContext.close();

  const userContext = await browser.newContext({ viewport });
  await userContext.addCookies([{ name: 'sc_user', value: '1', url: base }]);
  const userPage = await userContext.newPage();
  for (const [name, route] of operator) {
    await userPage.goto(base + route, { waitUntil: 'domcontentloaded' });
    await shot(userPage, folder, name);
  }
  await userContext.close();
}
await browser.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('visual ok', viewports.map((viewport) => viewport.id).join(' '));
