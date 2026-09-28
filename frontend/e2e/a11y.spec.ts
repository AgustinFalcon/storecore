import { expect, Page, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const publicScreens = [
  { path: '/', heading: 'Inicio' },
  { path: '/catalog', heading: 'Catálogo' },
  { path: '/catalog?offers=1', heading: 'Catálogo' },
  { path: '/catalog/SKU-100', heading: 'Lámpara de escritorio' },
  { path: '/customer/session', heading: 'Sesión customer' },
  { path: '/customer/register', heading: 'Crear cuenta customer' },
  { path: '/user/session', heading: 'Sesión user' },
];

const customerScreens = [
  { path: '/cart', heading: 'Carrito' },
  { path: '/checkout', heading: 'Checkout' },
  { path: '/checkout/shipping', heading: 'Envío' },
  { path: '/checkout/result/ord-1042', heading: 'Pedido iniciado' },
  { path: '/customer/profile', heading: 'Perfil customer' },
  { path: '/customer/addresses', heading: 'Direcciones' },
  { path: '/customer/favorites', heading: 'Favoritos' },
  { path: '/customer/orders', heading: 'Mis órdenes' },
  { path: '/customer/orders/ord-1042', heading: 'Orden ord-1042' },
  { path: '/customer/orders/ord-1042/envio', heading: 'Envío' },
  { path: '/customer/orders/ord-1042/comprobante', heading: 'Comprobante' },
];

const operatorScreens = [
  { path: '/user/content', heading: 'Contenido del home' },
  { path: '/user/catalog', heading: 'Catálogo operador' },
  { path: '/user/promos', heading: 'Promos MANUAL' },
  { path: '/user/orders', heading: 'Fulfillment' },
  { path: '/user/orders/ord-1042', heading: 'Fulfillment ord-1042' },
  { path: '/user/inventory', heading: 'Inventario WEB' },
  { path: '/user/mercadolibre', heading: 'Mercado Libre' },
  { path: '/user/capabilities', heading: 'Capabilities' },
  { path: '/user/profile-import', heading: 'Importar perfil' },
];

async function expectAccessible(page: Page, path: string, heading: string): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText(heading);
  await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeAttached();
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical');
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

for (const screen of publicScreens) {
  test(`axe has no serious violations on ${screen.path}`, async ({ page }) => {
    await expectAccessible(page, screen.path, screen.heading);
  });
}

test.describe('customer screens', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([{ name: 'sc_customer', value: '1', url: 'http://127.0.0.1:4300' }]);
  });

  for (const screen of customerScreens) {
    test(`axe has no serious violations on ${screen.path}`, async ({ page }) => {
      await expectAccessible(page, screen.path, screen.heading);
    });
  }
});

test.describe('operator screens', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([{ name: 'sc_user', value: '1', url: 'http://127.0.0.1:4300' }]);
  });

  for (const screen of operatorScreens) {
    test(`axe has no serious violations on ${screen.path}`, async ({ page }) => {
      await expectAccessible(page, screen.path, screen.heading);
    });
  }
});
