import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SurfaceIdentity, SurfaceTarget } from '../src/app/domain/navigation/surface-identity';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 404, json: { code: 404, data: null, message: 'No encontrado' } }));
});

for (const path of ['/no-existe', '/customer/no-existe/anidado', '/user/no-existe/anidado', '/catalog/sku/no-existe', '/recover', '/customer/favorites', '/user/offers', '/user/customers']) {
  test(`R8 Real Not Found preserves ${path} without inventing a surface`, async ({ page }, testInfo) => {
    const requested = path + '?source=unknown#requested';
    await page.goto(requested);
    await expect(page).toHaveURL(new URL(requested, testInfo.project.use.baseURL).href);
    const host = page.locator('[data-surface-id]');
    await expect(host).toHaveCount(1);
    await expect(host).toHaveAttribute('data-surface-id', SurfaceIdentity.Unknown.wire);
    await expect(host).toHaveAttribute('data-surface-target', SurfaceTarget.Real.wire);
    await expect(host).toHaveAttribute('data-surface-data', SurfaceTarget.Real.data);
    await expect(host).toHaveAttribute('data-surface-url', requested);
    await expect(host).toHaveAttribute('data-surface-actor', 'public');
    await expect(page.getByRole('heading', { name: 'Página no encontrada', exact: true })).toBeFocused();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations).toEqual([]);
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-cta="not-found-context"]')).toBeFocused();
    await page.locator('[data-cta="not-found-home"]').click();
    await expect(page).toHaveURL(new URL('/', testInfo.project.use.baseURL).href);
    await expect(host).toHaveAttribute('data-surface-id', SurfaceIdentity.Home.wire);
  });
}

test('R8 Real product 404 retains SC05 entity context and its URL', async ({ page }, testInfo) => {
  const path = '/catalog/NO-SUCH-PRODUCT';
  await page.goto(path);
  await expect(page).toHaveURL(new URL(path, testInfo.project.use.baseURL).href);
  await expect(page.locator('[data-surface-id]')).toHaveAttribute('data-surface-id', SurfaceIdentity.Product.wire);
  await expect(page.locator('sc-not-found')).toHaveCount(0);
  await expect(page.locator('.sc-pdp')).toBeVisible();
});
