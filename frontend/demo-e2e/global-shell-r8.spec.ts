import { expect, Page, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { DemoScreen } from '../src/app/demo/demo-screen';
import { SurfaceIdentity, SurfaceTarget } from '../src/app/domain/navigation/surface-identity';

async function login(page: Page, admin = false) {
  await page.goto('/demo/login');
  await page.getByLabel('Contraseña', { exact: true }).fill('demo');
  await page.locator('[data-cta="login-submit"]').click();
  await page.locator(admin ? '[data-cta="login-admin"]' : '[data-cta="login-customer"]').click();
}

for (const width of [390, 768, 1440]) {
  test(`R8 exact identity on all 26 Demo surfaces at ${width}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    for (const admin of [false, true]) {
      await login(page, admin);
      for (const screen of DemoScreen.all.filter(screen => screen.admin === admin)) {
        const surface = SurfaceIdentity.fromMatchedPath(screen.path, SurfaceTarget.Demo);
        const path = '/demo' + (screen.path ? '/' + screen.path.replace(':sku', 'DEMO-001').replace(':orderId', 'DEMO-100').replace(':id', admin ? 'ORD-1015' : 'DEMO-100') : '');
        await page.goto(path);
        await expect(page).toHaveURL(new URL(path, testInfo.project.use.baseURL).href);
        const host = page.locator('[data-surface-id]');
        await expect(host).toHaveCount(1);
        await expect(host).toHaveAttribute('data-surface-id', surface.wire);
        await expect(host).toHaveAttribute('data-surface-url', path);
        await expect(host).toHaveAttribute('data-surface-target', SurfaceTarget.Demo.wire);
        await expect(host).toHaveAttribute('data-surface-data', SurfaceTarget.Demo.data);
        await expect(host).toHaveAttribute('data-surface-actor', admin ? /^admin:/ : /^customer:/);
        await expect(page.locator('main h1')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`${surface.wire}-${width}.png`), fullPage: true });
      }
    }
  });
}

for (const path of ['/demo/no-existe', '/demo/customer/no-existe/anidado', '/demo/user/no-existe/anidado', '/demo/catalog/DEMO-001/no-existe']) {
  test(`R8 Demo Not Found preserves ${path} and recovers by keyboard`, async ({ page }, testInfo) => {
    const requested = path + '?source=unknown#requested';
    await page.goto(requested);
    await expect(page).toHaveURL(new URL(requested, testInfo.project.use.baseURL).href);
    await expect(page.locator('[data-surface-id]')).toHaveCount(1);
    await expect(page.locator('[data-surface-id]')).toHaveAttribute('data-surface-id', SurfaceIdentity.Unknown.wire);
    await expect(page.locator('[data-surface-id]')).toHaveAttribute('data-surface-url', requested);
    const title = page.getByRole('heading', { name: 'Página no encontrada', exact: true });
    await expect(title).toBeFocused();
    await expect(page.locator('main')).not.toContainText(path);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations).toEqual([]);
    await page.keyboard.press('Tab');
    const recovery = page.locator('[data-cta="not-found-context"]');
    await expect(recovery).toBeFocused();
    const destination = await recovery.getAttribute('href');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new URL(destination!, testInfo.project.use.baseURL).href);
  });
}

test('R8 missing product is an entity miss on SC05, distinct from unknown navigation', async ({ page }, testInfo) => {
  const path = '/demo/catalog/NO-SUCH-PRODUCT';
  await page.goto(path);
  await expect(page).toHaveURL(new URL(path, testInfo.project.use.baseURL).href);
  await expect(page.locator('[data-surface-id]')).toHaveAttribute('data-surface-id', SurfaceIdentity.Product.wire);
  await expect(page.getByRole('heading', { name: 'Producto no encontrado', exact: true })).toBeVisible();
  await expect(page.locator('sc-not-found')).toHaveCount(0);
  await page.locator('[data-cta="missing-product-catalog"]').click();
  await expect(page.locator('[data-surface-id]')).toHaveAttribute('data-surface-id', SurfaceIdentity.Catalog.wire);
});
