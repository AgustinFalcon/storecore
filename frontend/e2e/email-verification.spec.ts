import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { VerificationOutcome } from '../src/app/domain/access/email-verification';
import { RecoveryRealm } from '../src/app/domain/access/recovery';

const token = 'v'.repeat(43); // Boundary fixture only; never a captured production secret.
const envelope = (kind: VerificationOutcome, extra: Record<string, unknown> = {}) => ({
  code: 200,
  data: { kind: kind.wire, ...extra },
  errorCode: null,
});

for (const realm of [RecoveryRealm.Customer, RecoveryRealm.User]) {
  test(`${realm.wire} verification sanitizes the secret and requires explicit completion`, async ({ page }) => {
    let inspections = 0;
    let completions = 0;
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/email-verification/inspect')) {
        inspections++;
        expect(await page.evaluate(() => location.hash)).toBe('');
        expect(route.request().postDataJSON()).toEqual({ token });
        return route.fulfill({ json: envelope(VerificationOutcome.Ready, { expiresAt: new Date(Date.now() + 60_000).toISOString() }) });
      }
      if (path.endsWith('/auth/email-verification/complete')) {
        completions++;
        expect(route.request().postDataJSON()).toEqual({ token });
        return route.fulfill({ json: envelope(VerificationOutcome.Verified) });
      }
      return route.fulfill({ status: path.endsWith('/me') ? 401 : 503, json: {} });
    });

    await page.goto(`/verify-email#realm=${realm.wire}&token=${token}`);
    await expect(page).toHaveURL(/\/verify-email$/);
    await expect(page.getByRole('heading', { name: 'Verificar mi correo' })).toBeFocused();
    await expect(page.getByText(VerificationOutcome.Ready.label, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirmar mi correo' })).toBeEnabled();
    expect(inspections).toBe(1);
    expect(completions).toBe(0);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage, history: history.state }))).not.toContain(token);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.getByRole('button', { name: 'Confirmar mi correo' }).click();
    await expect(page.getByText(VerificationOutcome.Verified.label, { exact: true })).toBeVisible();
    expect(completions).toBe(1);
    await expect(page.getByRole('link', { name: 'Ingresar' })).toHaveAttribute('href', new RegExp(`recoveredRealm=${realm.wire}`));
  });
}
