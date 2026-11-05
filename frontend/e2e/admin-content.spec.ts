import { expect, Page, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { UserRole } from '../src/app/domain/user/user-role';

const envelope = (data: unknown) => ({ code: 200, data, message: null, errorCode: null, retryable: null, traceId: null });
async function mockSession(page: Page): Promise<void> {
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/internal/me')) return route.fulfill({ json: envelope({ id: 'content-admin', roles: [UserRole.Admin.wire] }) });
    if (path.endsWith('/internal/auth/csrf')) return route.fulfill({ json: envelope({}), headers: { 'X-CSRF-Token': 'content-csrf' } });
    if (path.endsWith('/health')) return route.fulfill({ json: envelope({ status: 'UP' }) });
    if (path.endsWith('/catalog/categories')) return route.fulfill({ json: envelope([]) });
    return route.fulfill({ status: path.endsWith('/me') ? 401 : 503, json: {} });
  });
}

for (const width of [320, 1440]) {
  test(`content preview, discard, navigation protection and confirmed publication at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 }); await mockSession(page);
    let confirmed = { title: 'Portada publicada', body: 'Texto original' }; let writes = 0; let fail = true;
    await page.route('**/api/v1/user/content/home', async (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: envelope(confirmed) });
      writes++;
      if (fail) return route.fulfill({ status: 503, json: envelope(null) });
      confirmed = route.request().postDataJSON(); return route.fulfill({ json: envelope(confirmed) });
    });
    await page.goto('/user/content'); const title = page.getByLabel('Título', { exact: true });
    await expect(title).toHaveValue(confirmed.title);
    await expect(page.getByRole('button', { name: 'Publicar cambios', exact: true })).toBeDisabled();
    await title.fill('Nueva portada <img src=x onerror=alert(1)>');
    const preview = page.getByRole('region', { name: 'Vista previa de la portada', exact: true });
    await expect(preview).toContainText('Nueva portada <img src=x onerror=alert(1)>');
    await expect(preview.locator('img')).toHaveCount(0);
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('.sc-console-nav a[href="/user/home"]').click(); await expect(page).toHaveURL(/\/user\/content$/);
    await expect(title).toHaveValue('Nueva portada <img src=x onerror=alert(1)>');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Descartar cambios', exact: true }).click();
    await expect(title).toHaveValue('Portada publicada');
    await title.fill('Portada final');
    await page.getByRole('button', { name: 'Publicar cambios', exact: true }).click();
    const editor = page.locator('sc-user-content-view');
    await expect(editor.getByRole('alert')).toBeVisible(); await expect(title).toHaveValue('Portada final');
    fail = false; await editor.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await expect.poll(() => writes).toBe(2);
    await expect(page.getByRole('status')).toHaveText('Contenido publicado correctamente.'); expect(writes).toBe(2);
    await expect(page.getByRole('button', { name: 'Publicar cambios', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const axe = await new AxeBuilder({ page }).analyze(); expect(axe.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`sc16-real-confirmed-${width}.png`), fullPage: true });
    await title.fill('Cambios para descartar al salir'); page.once('dialog', (dialog) => dialog.accept());
    await page.locator('.sc-console-nav a[href="/user/home"]').click(); await expect(page).toHaveURL(/\/user\/home$/);
  });
}
