import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installApiFixtures } from './api-fixtures';
import { ScreenRealm } from './route-manifest';

for (const width of [1280, 375]) {
  test(`MockHttp unified selector is keyboard accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const api = await installApiFixtures(page, ScreenRealm.Dual);
    await page.addInitScript(() => localStorage.setItem('storecore.active-context', 'FUTURE'));
    await page.goto('/login', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Elegí cómo continuar' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Mi cuenta', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Operaciones', exact: true })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(item => item.impact === 'critical' || item.impact === 'serious')).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Mi cuenta', exact: true })).toBeFocused();
    await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/user/home');
    await expect(page.getByRole('heading', { name: 'Inicio de operaciones' })).toBeVisible();
    expect(api.seen.has('/api/v1/auth/context-selection')).toBe(false);
    expect(api.seen.has('/api/v1/auth/login')).toBe(false);
    expect(api.unexpected).toEqual([]);
  });
}
