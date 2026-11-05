import { expect, type Page } from '@playwright/test';
import { CapabilityCommandPhase, CapabilityOperationFilter, CapabilityTab } from '../src/app/demo/capabilities/capability-ledger';
import { DeliveryLevel } from '../src/app/domain/user/delivery-level';
import { ModuleAvailability } from '../src/app/domain/user/module-availability';
import { CapabilityModuleState } from '../src/app/domain/user/capability-module-state';
import { CommercialCapabilityId } from '../src/app/features/admin/user-capabilities.catalog';
import { SurfaceIdentity } from '../src/app/domain/navigation/surface-identity';

const cta = (page: Page, id: string) => page.locator(`[data-cta="${id}"]`);

/** Buyer-independent module discovery, owner navigation and one explicit local change. */
export async function exerciseCapabilitiesCtas(page: Page): Promise<void> {
  await page.goto('/demo/login');
  await page.getByLabel('Contraseña', { exact: true }).fill('demo');
  await cta(page, 'login-submit').click();
  await cta(page, 'login-admin').click();
  await cta(page, 'admin-nav-user/capabilities').click();
  await expect(page.locator('.capability-card')).toHaveCount(7);

  await cta(page, 'capabilities-filter-availability').selectOption({ label: ModuleAvailability.Available.label });
  await expect(page.locator('.capability-card')).toHaveCount(4);
  await cta(page, 'capabilities-filter-delivery').selectOption({ label: DeliveryLevel.Integrated.label });
  await expect(page.locator('.capability-card')).toHaveCount(2);
  await cta(page, 'capabilities-filter-status').selectOption({ label: CapabilityOperationFilter.Active.label });
  await expect(page.locator('.capability-card')).toHaveCount(1);
  await expect(page.locator('.capability-card h2')).toHaveText('Catálogo');
  await cta(page, 'capabilities-clear-filters').click();
  await expect(page.locator('.capability-card')).toHaveCount(7);

  await cta(page, 'capabilities-search').fill('Inventario');
  await cta(page, 'capabilities-search').press('Tab');
  await expect(page.locator('.capability-card')).toHaveCount(1);
  await expect(page.locator('.capability-card h2')).toHaveText('Inventario');
  await cta(page, 'capabilities-clear-filters').click();

  for (const id of CommercialCapabilityId.values) {
    const opener = cta(page, 'capabilities-info-' + id.wire);
    const label = (await opener.getAttribute('aria-label'))!.replace('Ver información de ', '');
    await opener.click();
    await expect(page.getByRole('dialog', { name: label, exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('No certifica integración ni homologación.');
    await cta(page, 'capabilities-close').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(opener).toBeFocused();
  }

  for (const owner of [
    { id: CommercialCapabilityId.Catalog, surface: SurfaceIdentity.AdminCatalog },
    { id: CommercialCapabilityId.Inventory, surface: SurfaceIdentity.Inventory },
    { id: CommercialCapabilityId.MercadoLibre, surface: SurfaceIdentity.MercadoLibre },
    { id: CommercialCapabilityId.Outlet, surface: SurfaceIdentity.AdminCatalog },
  ]) {
    await cta(page, 'capabilities-owner-' + owner.id.wire).click();
    await expect(page).toHaveURL(new URL('/demo/' + owner.surface.path, page.url()).href);
    await expect(page.locator('[data-surface-id]')).toHaveAttribute('data-surface-id', owner.surface.wire);
    await page.goBack();
    await expect(page.locator('[data-surface-id]')).toHaveAttribute('data-surface-id', SurfaceIdentity.Capabilities.wire);
  }

  await cta(page, 'capabilities-tab-technical').click();
  await expect(page).toHaveURL(new RegExp('tab=' + CapabilityTab.Technical.wire));
  await expect(page.locator('[data-cta^="module-toggle-"]')).toHaveCount(4);
  await cta(page, 'capabilities-tab-modules').click();
  await expect(page).toHaveURL(new RegExp('tab=' + CapabilityTab.Modules.wire));
  await expect(page.locator('.capability-card')).toHaveCount(7);

  const reason = 'Pausa comercial local revisada por administración';
  await cta(page, 'capabilities-reason').fill(reason);
  await cta(page, 'capabilities-reason').press('Tab');
  await cta(page, 'capabilities-review').click();
  await expect(page.getByRole('dialog')).toContainText(reason);
  await expect(page.getByRole('dialog')).toContainText(CapabilityModuleState.Paused.label);
  await cta(page, 'capabilities-confirm').click();
  await expect(page.getByRole('dialog')).toContainText(CapabilityCommandPhase.Confirmed.label);
  await cta(page, 'capabilities-close').click();
  await expect(page.locator('section[aria-labelledby="change-title"]')).toContainText(CapabilityModuleState.Paused.label);
}
