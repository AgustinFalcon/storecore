import { expect, test } from '@playwright/test';

const cta = (page: import('@playwright/test').Page, id: string) => page.locator(`[data-cta="${id}"]`);

test('catalog context survives product navigation, reload and browser history', async ({ page }) => {
  await page.goto('/demo/catalog?sort=name&page=2');
  await expect(page.getByText('Página 2 de 2', { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel('Hasta $')).toHaveValue('');
  const firstCard = page.locator('.product-card').first();
  const sku = await firstCard.locator('[data-cta^="product-open-"]').getAttribute('data-cta');
  await firstCard.locator('[data-cta^="product-open-"]').click();
  await expect(page).toHaveURL(/sort=name/);
  await expect(page).toHaveURL(/page=2/);
  await page.reload();
  const related = page.locator('[data-cta^="related-"]').first();
  await expect(related).toBeVisible();
  await related.click();
  await expect(page).toHaveURL(/sort=name/);
  await expect(page).toHaveURL(/page=2/);
  await cta(page, 'product-back').click();
  await expect(page).toHaveURL(/sort=name/);
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText('Página 2 de 2', { exact: true }).first()).toBeVisible();
  await expect(page.locator(`[data-cta="${sku}"]`)).toBeVisible();
  await page.goBack();
  await expect(page.locator('main h1')).toBeVisible();
  await page.goForward();
  await expect(page.getByText('Página 2 de 2', { exact: true }).first()).toBeVisible();
});

test('filters are URL state, reset pagination and recover unknown values', async ({ page }) => {
  await page.goto('/demo/catalog?page=2');
  await page.getByLabel('Categoría', { exact: true }).selectOption('Herramientas');
  await expect(page).toHaveURL(/category=Herramientas/);
  await expect(page).not.toHaveURL(/page=2/);
  await page.getByLabel('Con stock').check();
  await expect(page).toHaveURL(/stock=available/);
  await page.getByLabel('Hasta $').fill('0');
  await expect(page).toHaveURL(/max=0/);
  await expect(page.getByRole('heading', { name: 'No encontramos productos' })).toBeVisible();
  await cta(page, 'catalog-filter-clear').click();
  await expect(page).toHaveURL(/\/demo\/catalog$/);
  await expect(page.locator('.product-card')).not.toHaveCount(0);

  await page.goto('/demo/catalog?sort=future&stock=future');
  await expect(page.getByRole('status')).toContainText('no reconoce');
  await expect(page.getByLabel('Ordenar')).toHaveValue('');
  await page.getByRole('button', { name: 'Recuperar catálogo' }).click();
  await expect(page).toHaveURL(/\/demo\/catalog$/);
  await expect(page.getByRole('status')).toHaveCount(0);
});

for (const width of [390, 768, 1440]) {
  test(`catalog filters and result grid do not overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : 900 });
    await page.goto('/demo/catalog?q=taladro&stock=available&sort=price-up');
    await expect(page.getByText('Filtrar y ordenar')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
