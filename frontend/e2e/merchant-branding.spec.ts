import { expect, test } from '@playwright/test';
import { RouteActor } from '../src/app/features/navigation/productive-route-manifest';
import { installProductiveRouteFixture } from './support/productive-route-fixture';
const branding = { revision: 1, businessName: 'Tienda accesible', logoUrl: null, primaryColor: '#767676', onPrimaryColor: '#ffffff' };
for (const width of [390, 1440]) {
  test('unblended near-threshold branding at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const evidence = await installProductiveRouteFixture(page, RouteActor.Anonymous);
    await page.route('**/api/v1/storefront/branding', route => route.fulfill({ json: { code: 200, data: branding } }));
    await page.goto('/');
    await expect(page.locator('.chrome__brand')).toHaveText('Tienda accesible');
    await expect(page.locator('.sc-carousel')).toBeVisible();
    const rendered = await page.locator('.chrome, .sc-carousel, .sc-shell-foot').evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color, opacity: style.opacity, backgroundImage: style.backgroundImage,
        descendants: [...element.querySelectorAll('h2, p, .chrome__brand, .chrome__account, .chrome__icon, svg')].map(child => ({ color: getComputedStyle(child).color, opacity: getComputedStyle(child).opacity })) };
    }));
    for (const element of rendered) {
      expect(element.background).toBe('rgb(118, 118, 118)'); expect(element.color).toBe('rgb(255, 255, 255)');
      expect(element.opacity).toBe('1'); expect(element.backgroundImage).toBe('none');
      for (const child of element.descendants) { expect(child.color).toBe('rgb(255, 255, 255)'); expect(child.opacity).toBe('1'); }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(evidence.unhandled).toEqual([]);
  });
}
test('ADMIN publish applies returned branding immediately and confirms conflict reload', async ({ page }) => {
  await installProductiveRouteFixture(page, RouteActor.Admin);
  let published = { ...branding };
  let conflict = true;
  await page.route('**/api/v1/user/settings/branding', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { code: 200, data: published } });
    if (conflict) return route.fulfill({ status: 409, json: { code: 409, message: 'Conflict' } });
    const command = route.request().postDataJSON();
    expect(command.expectedRevision).toBe(1);
    published = { ...command, revision: 2 };
    return route.fulfill({ headers: { 'X-CSRF-TOKEN': 'rotated' }, json: { code: 200, data: published } });
  });
  await page.goto('/user/settings');
  await expect(page.getByRole('heading', { name: 'Apariencia', exact: true })).toBeVisible();
  await page.locator('#branding-name').fill('Mi borrador');
  await page.getByRole('button', { name: 'Publicar apariencia', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Publicar apariencia', exact: true })).toBeDisabled();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Recargar apariencia publicada' }).click();
  await expect(page.locator('#branding-name')).toHaveValue('Mi borrador');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Recargar apariencia publicada' }).click();
  await expect(page.locator('#branding-name')).toHaveValue('Tienda accesible');
  conflict = false;
  await page.locator('#branding-name').fill('Nueva identidad');
  await page.getByRole('button', { name: 'Publicar apariencia', exact: true }).click();
  await expect(page.locator('.chrome__brand')).toContainText('Nueva identidad');
  await expect(page.locator('.sc-shell-foot')).toContainText('Nueva identidad');
  await expect(page.locator('.chrome')).toHaveCSS('background-color', 'rgb(118, 118, 118)');
  await expect(page.locator('.chrome__hint')).toHaveCSS('opacity', '1');
  await page.getByRole('link', { name: 'Ver tienda', exact: true }).click();
  await expect(page.locator('.chrome__brand')).toHaveText('Nueva identidad');
});
