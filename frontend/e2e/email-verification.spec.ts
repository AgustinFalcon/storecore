import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { VerificationOutcome } from '../src/app/domain/access/email-verification';
import { RecoveryRealm } from '../src/app/domain/access/recovery';
import { UserRole } from '../src/app/domain/user/user-role';

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

for (const realm of [RecoveryRealm.Customer, RecoveryRealm.User]) {
  test(`${realm.wire} account CTA preserves its realm when only the opposite session exists`, async ({ page }) => {
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/email-verification/inspect')) return route.fulfill({ json: envelope(VerificationOutcome.Ready, { expiresAt: new Date(Date.now() + 60_000).toISOString() }) });
      if (path.endsWith('/auth/email-verification/complete')) return route.fulfill({ json: envelope(VerificationOutcome.Verified) });
      if (path.endsWith('/internal/me')) return realm === RecoveryRealm.Customer
        ? route.fulfill({ json: { code: 200, data: { id: 'opposite-user', roles: [UserRole.Operator.wire] } } })
        : route.fulfill({ status: 401, json: { code: 401 } });
      if (path.endsWith('/customer/me')) return realm === RecoveryRealm.User
        ? route.fulfill({ json: { code: 200, data: { id: 'opposite-customer', email: 'opposite@example.test', firstName: 'Opposite', lastName: 'Session', phone: '' } } })
        : route.fulfill({ status: 401, json: { code: 401 } });
      if (path.endsWith('/auth/csrf')) return route.fulfill({ headers: { 'X-CSRF-Token': 'opposite-session-csrf' }, json: { code: 200, data: {} } });
      return route.fulfill({ status: 503, json: {} });
    });
    await page.goto(`/verify-email#realm=${realm.wire}&token=${token}`);
    await page.getByRole('button', { name: 'Confirmar mi correo' }).click();
    await page.getByRole('link', { name: 'Volver a mi cuenta' }).click();
    await expect(page).toHaveURL(new RegExp(`/login\\?.*recoveredRealm=${realm.wire}`));
    await expect(page.getByRole('heading', { name: 'Ingresar', exact: true })).toBeVisible();
  });
}
