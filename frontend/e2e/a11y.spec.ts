import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { screens, ScreenRealm } from './route-manifest';
import { runtimeLeafPaths } from './runtime-routes';
import { installApiFixtures } from './api-fixtures';
import { assertLoadedContent } from './readiness';

test('manifest covers every runtime leaf route exactly once', () => {
  expect(screens).toHaveLength(24);
  expect(new Set(screens.map((screen) => screen.pattern)).size).toBe(screens.length);
  expect(screens.map((screen) => screen.pattern).sort()).toEqual(runtimeLeafPaths());
});

for (const screen of screens) {
  test(`route smoke and axe: ${screen.pattern}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const api = await installApiFixtures(page, screen.realm);
    await page.goto(screen.url, { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(new RegExp(screen.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText(screen.heading);
    await expect(page.locator(screen.ready).first()).toBeAttached();
    await assertLoadedContent(page, screen);
    await expect(page.locator('.status--loading')).toHaveCount(0);
    await expect(page.locator('.status--error')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeAttached();
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical');
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    expect(api.seen.has('/api/v1/health')).toBe(true);
    if (screen.realm === ScreenRealm.Customer) expect(api.seen.has('/api/v1/customer/auth/csrf')).toBe(true);
    if (screen.realm === ScreenRealm.User) expect(api.seen.has('/api/v1/internal/auth/csrf')).toBe(true);
    expect(api.unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}
