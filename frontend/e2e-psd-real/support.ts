import { expect, type Page } from '@playwright/test';
import { AccessContext } from '../src/app/domain/access/access-context';
import { LoginResolution } from '../src/app/domain/access/login-resolution';
import { mapAccessResponse } from '../src/app/data/mappers/access-http.mapper';
import { UserRole } from '../src/app/domain/user/user-role';

export const origin = 'https://localhost:4301';
export const customerEmail = 'showcase.customer@storecore.invalid';

export async function login(page: Page, context: AccessContext, role = UserRole.Admin): Promise<void> {
  const email = context === AccessContext.User
    ? role === UserRole.Operator ? 'psd-operator@storecore.invalid' : 'psd-browser-admin@storecore.invalid' : customerEmail;
  const password = context === AccessContext.User ? 'PSD-disposable-fixture-2026!' : 'StoreCore-showcase-2026!';
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  const response = page.waitForResponse(item => new URL(item.url()).pathname === '/api/v1/auth/login');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page).not.toHaveURL(/\/login/);
  const cookies = await page.context().cookies();
  const cookie = cookies.find(item => item.name === (context === AccessContext.User ? '__Host-storecore-internal' : '__Host-storecore-customer'));
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
}

export async function apiCustomerLogin(page: Page): Promise<void> {
  const response = await page.request.post('/api/v1/auth/login', { headers: { Origin: origin },
    data: { email: customerEmail, password: 'StoreCore-showcase-2026!' } });
  expect(response.status()).toBe(200);
  const result = mapAccessResponse(await response.json());
  expect(result.resolution).not.toBe(LoginResolution.Unknown);
  expect(result.context).toBe(AccessContext.Customer);
}
