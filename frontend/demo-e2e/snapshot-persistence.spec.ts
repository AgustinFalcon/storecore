import { expect, test } from '@playwright/test';

test('only one same-origin Demo page writes and ownership transfers after reload', async ({ context, page }) => {
  await page.goto('/demo');
  await expect(page.getByText('Los cambios de esta pestaña se guardan localmente.')).toBeVisible();
  await expect(page.locator('[data-cta="shell-reset-open"]')).toBeEnabled();

  const reader = await context.newPage();
  await reader.goto('/demo');
  await expect(reader.getByText('Esta pestaña es de consulta.')).toBeVisible();
  await expect(reader.locator('[data-cta="shell-reset-open"]')).toBeDisabled();

  await page.close();
  await reader.reload();
  await expect(reader.getByText('Los cambios de esta pestaña se guardan localmente.')).toBeVisible();
  await expect(reader.locator('[data-cta="shell-reset-open"]')).toBeEnabled();
});
