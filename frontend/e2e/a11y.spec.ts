import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const publicScreens = [
  { path: '/', heading: /Inicio/i },
  { path: '/catalog', heading: /Catálogo/i },
  { path: '/customer/session', heading: /Sesión customer/i },
  { path: '/customer/register', heading: /Crear cuenta customer/i },
  { path: '/user/session', heading: /Sesión user/i },
];

for (const screen of publicScreens) {
  test(`axe has no serious violations on ${screen.path}`, async ({ page }) => {
    await page.goto(screen.path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText(screen.heading);
    await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeAttached();
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical');
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
}
