import { expect, test } from '@playwright/test';
import { RecoveryOutcome, RecoveryRealm } from '../src/app/domain/access/recovery';

test('production classpath is globally unavailable through real HTTPS UI without delivery or tokens', async ({ page }) => {
  // No route interception, TestConfiguration, capture port or delivery provider.
  await page.goto('/recover');
  for (const realm of RecoveryRealm.all) for (const email of ['known@example.test', 'absent@example.test']) {
    await page.getByLabel('Acceso', { exact: true }).selectOption(realm.wire);
    await page.getByLabel('Email', { exact: true }).fill(email);
    const response = page.waitForResponse(response => response.url().endsWith(`/${realm.path}/auth/recovery/requests`));
    await page.getByRole('button', { name: 'Solicitar enlace', exact: true }).click();
    const received = await response;
    expect(received.status()).toBe(503);
    expect((await received.json()).errorCode).toBe(RecoveryOutcome.Unavailable.wire);
    expect(received.headers()['cache-control']).toContain('no-store');
    await expect(page.getByText(RecoveryOutcome.Unavailable.label, { exact: true })).toBeVisible();
    await expect(page.getByText(RecoveryOutcome.Accepted.label, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Corregir email o solicitar de nuevo' }).click();
  }
});
