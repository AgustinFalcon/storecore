import { expect, Page, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { UserRole } from '../src/app/domain/user/user-role';

const envelope = (data: unknown) => ({ code: 200, data, message: null, errorCode: null, retryable: null, traceId: null });
const longKey = 'section_' + 'a'.repeat(72);
const sections = [
  { sectionKey: longKey, content: { title: '<img src=x onerror=alert(1)>' }, active: true, sortOrder: 0 },
  { sectionKey: 'footer', content: { title: 'Contacto' }, active: false, sortOrder: 1 },
];
const manifest = JSON.stringify({ profile_name: 'universal-tools-profile', profile_version: '1.0.0', coreCompatibility: '1.x', content: { homeSections: sections } }, null, 2);
const changes = sections.map((section, i) => ({ sectionKey: section.sectionKey, operation: i ? 'UPDATE' : 'ADD', ...(i ? { before: { content: { title: 'Antes' }, active: true, sortOrder: 1 } } : {}), after: { content: section.content, active: section.active, sortOrder: section.sortOrder } }));

async function mockSession(page: Page, role = UserRole.Admin): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/internal/me')) return route.fulfill({ json: envelope({ id: 'profile-admin', roles: [role.wire] }) });
    if (path.endsWith('/internal/auth/csrf')) return route.fulfill({ json: envelope({}), headers: { 'X-CSRF-Token': 'profile-csrf' } });
    if (path.endsWith('/health')) return route.fulfill({ json: envelope({ status: 'UP' }) });
    if (path.endsWith('/catalog/categories')) return route.fulfill({ json: envelope([]) });
    return route.fulfill({ status: path.endsWith('/me') ? 401 : 503, json: {} });
  });
}
async function prepare(page: Page): Promise<void> {
  await page.goto('/user/profile-import');
  await page.getByLabel('Contenido del perfil').fill(manifest);
  await page.getByRole('button', { name: 'Previsualizar manifiesto', exact: true }).click();
  await expect(page.getByLabel(`Seleccionar sección ${longKey}`, { exact: true })).toBeEnabled();
}
async function selectAndRepreview(page: Page): Promise<void> {
  await page.getByLabel(`Seleccionar sección ${longKey}`, { exact: true }).check();
  await expect(page.getByRole('button', { name: 'Revisar confirmación', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Previsualizar manifiesto', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Revisar confirmación', exact: true })).toBeEnabled();
}
for (const width of [320, 390, 768, 1440]) {
  test(`profile import exact-text journey, keyboard, axe and reflow at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 }); await mockSession(page);
    const previews: string[] = []; const merges: string[] = [];
    await page.route('**/api/v1/user/profiles/preview', (route) => { previews.push(route.request().postDataJSON().manifest); return route.fulfill({ json: envelope({ compatible: true, version: '1.0.0', diff: JSON.stringify(changes) }) }); });
    await page.route('**/api/v1/user/profiles/merge', async (route) => {
      merges.push(route.request().postDataJSON().manifest);
      await route.fulfill({ json: envelope({ compatible: true, version: '1.0.0', diff: JSON.stringify({ changes: [changes[0]] }) }) });
    });
    await prepare(page); await expect(page.getByRole('checkbox')).toHaveCount(2);
    await page.getByText(`Ver antes y después de ${longKey}`, { exact: true }).click();
    await expect(page.getByLabel(`Después de ${longKey}`, { exact: true })).toContainText('<img src=x onerror=alert(1)>'); expect(await page.locator('.import-change img').count()).toBe(0);
    await selectAndRepreview(page);
    expect(JSON.parse(previews[1]).mergeSelection.homeSections).toEqual([longKey]);
    const trigger = page.getByRole('button', { name: 'Revisar confirmación', exact: true });
    await trigger.click(); const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible(); await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(page.getByRole('button', { name: 'Confirmar importación', exact: true })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(trigger).toBeFocused(); expect(merges).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    let axe = await new AxeBuilder({ page }).analyze(); expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`sc25-review-${width}.png`), fullPage: true });
    await trigger.click(); axe = await new AxeBuilder({ page }).analyze(); expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`sc25-confirm-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Confirmar importación', exact: true }).click();
    await expect(page.getByText('Importación aplicada', { exact: true })).toBeVisible(); expect(merges).toEqual([previews[1]]);
  });
}
test('incompatible, malformed, unknown and sensitive server diff fail closed', async ({ page }) => {
  await mockSession(page);
  let result: unknown = { compatible: false, version: '2.0.0', diff: JSON.stringify(changes) }; let writes = 0;
  await page.route('**/api/v1/user/profiles/preview', (route) => route.fulfill({ json: envelope(result) }));
  await page.route('**/api/v1/user/profiles/merge', (route) => { writes++; return route.abort(); });
  await page.goto('/user/profile-import'); const editor = page.getByLabel('Contenido del perfil'); const preview = page.getByRole('button', { name: 'Previsualizar manifiesto', exact: true });
  await editor.fill(manifest); await preview.click(); await expect(page.getByText('Incompatible', { exact: true })).toBeVisible(); await expect(page.getByRole('checkbox').first()).toBeDisabled();
  for (const diff of ['{', JSON.stringify([{ ...changes[0], operation: 'INVENTED' }, changes[1]]), JSON.stringify([{ ...changes[0], after: {} }]), JSON.stringify([{ ...changes[0], after: { password: 'hidden-value' } }])]) {
    result = { compatible: true, version: '1.0.0', diff }; await preview.click(); await expect(page.getByRole('alert')).toContainText('Respuesta no reconocida'); await expect(page.getByRole('button', { name: 'Revisar confirmación', exact: true })).toBeDisabled(); await expect(page.locator('.import-review')).not.toContainText('hidden-value');
  }
  expect(writes).toBe(0);
});
test('known failure retains draft; uncertain merge recovers with preview only; 403 clears private state', async ({ page }) => {
  await mockSession(page); let previewStatus = 200; let mergeStatus = 400; let malformedSuccess = false; let writes = 0; let previews = 0;
  await page.route('**/api/v1/user/profiles/preview', (route) => { previews++; return route.fulfill({ status: previewStatus, json: previewStatus === 200 ? envelope({ compatible: true, version: '1.0.0', diff: JSON.stringify(changes) }) : {} }); });
  await page.route('**/api/v1/user/profiles/merge', (route) => {
    writes++;
    return malformedSuccess
      ? route.fulfill({ status: 200, contentType: 'application/json', body: '{' })
      : route.fulfill({ status: mergeStatus, json: {} });
  });
  await prepare(page); await selectAndRepreview(page); await page.getByRole('button', { name: 'Revisar confirmación', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar importación', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('El borrador se conserva'); await expect(page.getByLabel('Contenido del perfil')).toHaveValue(/mergeSelection/); expect(writes).toBe(1);
  mergeStatus = 503; await page.getByRole('button', { name: 'Previsualizar manifiesto', exact: true }).click(); await page.getByRole('button', { name: 'Revisar confirmación', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar importación', exact: true }).click();
  await expect(page.getByText('Resultado incierto', { exact: true })).toBeVisible(); expect(writes).toBe(2); const prior = previews;
  await page.getByRole('button', { name: 'Volver a consultar vista previa', exact: true }).click(); await expect(page.getByRole('button', { name: 'Revisar confirmación', exact: true })).toBeEnabled(); expect(previews).toBe(prior + 1); expect(writes).toBe(2);
  malformedSuccess = true; await page.getByRole('button', { name: 'Revisar confirmación', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar importación', exact: true }).click();
  await expect(page.getByText('Resultado incierto', { exact: true })).toBeVisible(); expect(writes).toBe(3);
  previewStatus = 403; await page.getByRole('button', { name: 'Volver a consultar vista previa', exact: true }).click(); await expect(page.getByText('Acceso no disponible', { exact: true })).toBeVisible(); await expect(page.getByLabel('Contenido del perfil')).toHaveCount(0); await expect(page.locator('.import-change')).toHaveCount(0);
});
test('operator direct route denies all profile calls', async ({ page }) => {
  await mockSession(page, UserRole.Operator); let calls = 0;
  await page.route('**/api/v1/user/profiles/**', (route) => { calls++; return route.abort(); });
  await page.goto('/user/profile-import'); await expect(page.getByText('Acceso no disponible', { exact: true })).toBeVisible(); await expect(page.getByLabel('Contenido del perfil')).toHaveCount(0); expect(calls).toBe(0);
});
test('double click dispatches a single write and actor change discards a late result', async ({ page }) => {
  await mockSession(page); let writes = 0; let finish = (): void => { /* assigned by gate */ };
  const gate = new Promise<void>((resolve) => { finish = resolve; });
  await page.route('**/api/v1/user/profiles/preview', (route) => route.fulfill({ json: envelope({ compatible: true, version: '1.0.0', diff: JSON.stringify(changes) }) }));
  await page.route('**/api/v1/user/profiles/merge', async (route) => { writes++; await gate; await route.fulfill({ json: envelope({ compatible: true, version: '1.0.0', diff: JSON.stringify({ changes: [changes[0]] }) }) }); });
  await prepare(page); await selectAndRepreview(page); await page.getByRole('button', { name: 'Revisar confirmación', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar importación', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); }); await expect(page.getByText('Aplicando selección…', { exact: true })).toBeVisible(); expect(writes).toBe(1);
  // Dev-only session signal mutation exercises the same live store actor effect as logout/rehydration.
  await page.evaluate(() => {
    const ng = (window as unknown as { ng: { getComponent(element: Element | null): { user: { clear(): void } } } }).ng;
    ng.getComponent(document.querySelector('sc-shell')).user.clear();
  });
  await expect(page.getByText('Acceso no disponible', { exact: true })).toBeVisible(); finish(); await expect(page.getByLabel('Contenido del perfil')).toHaveCount(0); await expect(page.getByText('Importación aplicada', { exact: true })).toHaveCount(0); expect(writes).toBe(1);
});
