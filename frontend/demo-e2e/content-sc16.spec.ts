import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';
import { ContentDraftIssue } from '../src/app/demo/content/content-draft';
import { ContentEditPhase, ContentDraftStatus } from '../src/app/demo/content/content-types';
import { UserRole } from '../src/app/domain/user/user-role';
import { demoSeed } from '../src/app/demo/demo-model';

const cta = (page: Page, id: string) => page.locator('[data-cta="'+id+'"]');
const snapshot = (page: Page) => page.evaluate(() => localStorage.getItem('storecore.commercial-demo.v1'));
async function login(page: Page, role = UserRole.Admin) {
  await page.goto('/demo/login'); await page.getByLabel('Contraseña', { exact: true }).fill('demo');
  await cta(page, 'login-submit').click(); await cta(page, role === UserRole.Operator ? 'login-operator' : 'login-admin').click();
  await page.goto('/demo/user/content');
}

test('SC16 preview uses unsaved copy; saving/reload preserves draft but never publishes Home', async ({ page }) => {
  await login(page); const title = page.getByLabel('Título principal', { exact: true }); const homeTitle = await title.inputValue();
  const before = await snapshot(page); await title.fill('Portada en preparación');
  await cta(page, 'content-preview').click();
  const preview = page.getByRole('dialog', { name: 'Vista previa del borrador' });
  await expect(preview.getByRole('heading', { name: 'Portada en preparación', exact: true })).toBeVisible();
  await expect(preview.locator('.category-card')).toHaveCount(3);
  await expect(preview.locator('.product-card')).toHaveCount(4);
  expect(await preview.locator('.product-image').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  expect(await snapshot(page)).toBe(before);
  await cta(page, 'content-preview-close').click(); await expect(cta(page, 'content-preview')).toBeFocused();
  await cta(page, 'content-save').click(); await expect(page.locator('.draft-status')).toContainText(ContentEditPhase.Saved.label);
  const saved = JSON.parse((await snapshot(page))!); expect(saved.version).toBe(demoSeed().version); expect(saved.title).toBe(homeTitle); expect(saved.contentDraft.title).toBe('Portada en preparación');
  await page.reload(); await expect(title).toHaveValue('Portada en preparación');
  await cta(page, 'content-current-store').click(); await expect(page.getByRole('heading', { name: homeTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Portada en preparación', exact: true })).toHaveCount(0);
});

test('SC16 navigation cancel preserves input; explicit discard leaves and local discard restores saved draft', async ({ page }) => {
  await login(page); const title = page.getByLabel('Título principal', { exact: true }); const initial = await title.inputValue();
  await title.fill('Saved draft'); await cta(page, 'content-save').click(); await expect(page.locator('.draft-status')).toContainText(ContentEditPhase.Saved.label);
  await title.fill('Unsaved edits'); await cta(page, 'content-current-store').click();
  const dialog = page.getByRole('dialog', { name: 'Salir sin guardar', exact: true }); await expect(dialog).toBeVisible();
  await expect(cta(page, 'content-discard-cancel')).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(cta(page, 'content-discard-confirm')).toBeFocused();
  await page.keyboard.press('Escape'); await expect(title).toHaveValue('Unsaved edits'); await expect(cta(page, 'content-current-store')).toBeFocused();
  await cta(page, 'content-cancel').click(); await cta(page, 'content-discard-cancel').click(); await expect(title).toHaveValue('Unsaved edits');
  await cta(page, 'content-cancel').click(); await cta(page, 'content-discard-confirm').click(); await expect(title).toHaveValue('Saved draft');
  await title.fill('Leave discarded'); await cta(page, 'content-current-store').click(); await cta(page, 'content-discard-confirm').click();
  await expect(page).toHaveURL(/\/demo$/); await expect(page.getByRole('heading', { name: initial, exact: true })).toBeVisible();
  await page.goto('/demo/user/content'); await expect(title).toHaveValue('Saved draft');
});

test('SC16 validation explains and focuses each invalid field without storage writes', async ({ page }) => {
  await login(page); const before = await snapshot(page), title = page.getByLabel('Título principal', { exact: true });
  await expect(page.locator('.field-error:visible')).toHaveCount(0);
  await title.fill(' '); await cta(page, 'content-save').click();
  await expect(title).toBeFocused(); await expect(title).toHaveAttribute('aria-invalid', 'true'); await expect(title).toHaveAttribute('aria-describedby', 'content-title-issue');
  await expect(page.locator('#content-title-issue')).toHaveText(ContentDraftIssue.Title.label);
  await expect(page.locator('.field-error:visible')).toHaveCount(1);
  await title.fill('Valid title');
  const blockTitle = page.locator('#content-block-title-0'); await blockTitle.fill(' '); await cta(page, 'content-save').click();
  await expect(blockTitle).toBeFocused(); await expect(blockTitle).toHaveAttribute('aria-invalid', 'true'); await expect(blockTitle).toHaveAttribute('aria-describedby', 'content-block-title-issue-0');
  await expect(page.locator('#content-block-title-issue-0')).toHaveText(ContentDraftIssue.BlockTitle.label);
  await expect(page.locator('.field-error:visible')).toHaveCount(1);
  await blockTitle.fill('Valid block');
  const body = page.locator('#content-block-body-0'); await body.fill(' '); await cta(page, 'content-save').click();
  await expect(body).toBeFocused(); await expect(body).toHaveAttribute('aria-invalid', 'true'); await expect(page.locator('#content-block-body-issue-0')).toHaveText(ContentDraftIssue.BlockBody.label);
  await expect(page.locator('.field-error:visible')).toHaveCount(1);
  expect(await snapshot(page)).toBe(before); expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('SC16 keyboard reorder retains focus on the moved block and announces preview order', async ({ page }) => {
  await login(page);
  await cta(page, 'content-down-service').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('[data-block-editor-id="service"] input')).toBeFocused();
  await expect(page.getByRole('status').filter({ hasText: 'bloque 2 de 2' })).toBeAttached();
  await cta(page, 'content-up-service').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('[data-block-editor-id="service"] input')).toBeFocused(); await expect(cta(page, 'content-up-service')).toBeDisabled();
  await cta(page, 'content-up-quality').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('[data-block-editor-id="quality"] input')).toBeFocused();
  await cta(page, 'content-preview').click(); await expect(page.locator('[data-preview-block]').first()).toHaveAttribute('data-preview-block', 'quality');
  await page.keyboard.press('Escape'); await expect(cta(page, 'content-preview')).toBeFocused();
});

test('SC16 failed write retains buffer and Home; retry saves only draft', async ({ page }) => {
  await login(page); const title = page.getByLabel('Título principal', { exact: true }), before = await snapshot(page);
  await page.evaluate(() => { const set = Storage.prototype.setItem; let fail = true; Storage.prototype.setItem = function(key, value) { if (key === 'storecore.commercial-demo.v1' && fail) { fail = false; throw new Error('quota test'); } return set.call(this, key, value); }; });
  await title.fill('Retry retained'); await cta(page, 'content-save').click();
  await expect(page.locator('.content-error')).toContainText('quota test'); await expect(title).toHaveValue('Retry retained'); expect(await snapshot(page)).toBe(before);
  await expect(page.locator('.draft-status')).toContainText(ContentEditPhase.Failure.label);
  await cta(page, 'content-save').click(); await expect(page.locator('.draft-status')).toContainText(ContentEditPhase.Saved.label);
  expect(JSON.parse((await snapshot(page))!).title).not.toBe('Retry retained');
});

test('SC16 Operator edits only the dedicated surface; Customer and Unknown cannot enter', async ({ page }) => {
  await login(page, UserRole.Operator); const title = page.getByLabel('Título principal', { exact: true });
  await title.fill('Operator draft'); await cta(page, 'content-save').click(); await expect(page.locator('.draft-status')).toContainText(ContentEditPhase.Saved.label);
  await page.goto('/demo/user/catalog'); await expect(page.getByRole('heading', { name: 'Ingresá para continuar' })).toBeVisible();
  await page.goto('/demo/user/content'); await title.fill('Private unsaved');
  await cta(page, 'shell-logout').click(); await expect(page).toHaveURL(/\/demo\/login$/);
  await page.goto('/demo/user/content'); await expect(page.getByRole('heading', { name: 'Acceso denegado' })).toBeVisible();
  await cta(page, 'content-login').click(); await page.getByLabel('Contraseña', { exact: true }).fill('demo'); await cta(page, 'login-submit').click(); await cta(page, 'login-customer').click();
  await page.goto('/demo/user/content'); await expect(page.getByRole('heading', { name: 'Acceso denegado' })).toBeVisible();
});

test('SC16 second tab is explicitly read-only until ownership transfers', async ({ page, context }) => {
  await login(page); await page.getByLabel('Título principal', { exact: true }).fill('First owner'); await cta(page, 'content-save').click(); await expect(page.locator('.draft-status')).toContainText(ContentEditPhase.Saved.label);
  const second = await context.newPage(); await login(second);
  await second.getByLabel('Título principal', { exact: true }).fill('Second buffer'); await expect(cta(second, 'content-save')).toBeDisabled();
  expect(JSON.parse((await snapshot(second))!).contentDraft.title).toBe('First owner');
  await page.close(); second.on('dialog', dialog => dialog.accept()); await second.reload();
  await expect(second.getByLabel('Título principal', { exact: true })).toHaveValue('First owner');
  await second.getByLabel('Título principal', { exact: true }).fill('Transferred owner'); await cta(second, 'content-save').click(); await expect(second.locator('.draft-status')).toContainText(ContentEditPhase.Saved.label); await second.close();
});

for (const width of [320, 390, 768, 900, 1440]) {
  test('SC16 editor and preview are accessible at '+width+'px', async ({ page }, info) => {
    await page.setViewportSize({ width, height: 950 }); await login(page);
    await expect(page.locator('.field-error:visible')).toHaveCount(0);
    await page.getByLabel('Título principal', { exact: true }).fill('Vista previa accesible');
    await expect(page.locator('.draft-status')).toContainText(ContentDraftStatus.Dirty.label);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath('content-editor-'+width+'.png'), fullPage: true });
    await cta(page, 'content-preview').click(); const dialog = page.getByRole('dialog', { name: 'Vista previa del borrador' }); await expect(dialog).toBeVisible(); await expect(cta(page, 'content-preview-close')).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('content-preview-'+width+'.png'), fullPage: true });
    await dialog.evaluate(element => element.scrollTop = element.scrollHeight);
    await page.screenshot({ path: info.outputPath('content-preview-products-'+width+'.png'), fullPage: true });
    await page.keyboard.press('Escape'); await expect(cta(page, 'content-preview')).toBeFocused();
    await cta(page, 'content-cancel').click(); expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath('content-discard-'+width+'.png'), fullPage: true }); await page.keyboard.press('Escape');
  });
}
