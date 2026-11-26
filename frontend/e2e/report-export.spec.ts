import { expect, test } from '@playwright/test';
import { RouteActor } from '../src/app/features/navigation/productive-route-manifest';
import { installProductiveRouteFixture } from './support/productive-route-fixture';

const reportUrl = '/user/reports?fromDate=2026-11-01&toDateExclusive=2026-11-26';
const filename = 'storecore-channel-report-2026-11-01-to-2026-11-26.csv';

test('downloads the correlated report CSV with its safe server filename', async ({ page }) => {
  await installProductiveRouteFixture(page, RouteActor.Operator);
  await page.goto(reportUrl);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV' }).click();
  expect((await download).suggestedFilename()).toBe(filename);
  await expect(page.getByText('Descarga solicitada', { exact: true })).toBeVisible();
});

test('decodes a stale-period Blob response and never presents it as CSV', async ({ page }) => {
  let downloads = 0;
  page.on('download', () => downloads++);
  await installProductiveRouteFixture(page, RouteActor.Operator, { reportExport: route => route.fulfill({
    status: 409,
    contentType: 'application/json',
    body: JSON.stringify({ errorCode: 'REPORT_PERIOD_STALE' }),
    headers: { 'Cache-Control': 'no-store' },
  }) });
  await page.goto(reportUrl);
  await page.getByRole('button', { name: 'Exportar CSV' }).click();
  await expect(page.getByText('El período cambió; actualizá el reporte', { exact: true })).toBeVisible();
  expect(downloads).toBe(0);
});

test('discards a late CSV after the operator applies a different period', async ({ page }) => {
  let release!: () => void;
  let requested!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  const requestSeen = new Promise<void>(resolve => requested = resolve);
  let downloads = 0;
  page.on('download', () => downloads++);
  await installProductiveRouteFixture(page, RouteActor.Operator, { reportExport: async route => {
    requested(); await gate;
    await route.fulfill({
      body: 'recordKind,metric\r\nMETA,\r\n', contentType: 'text/csv;charset=UTF-8',
      headers: { 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' },
    });
  } });
  await page.goto(reportUrl);
  await page.getByRole('button', { name: 'Exportar CSV' }).click();
  await requestSeen;
  await page.getByLabel('Desde').fill('2026-10-01');
  await page.getByLabel('Hasta (sin incluir)').fill('2026-11-01');
  await page.getByRole('button', { name: 'Aplicar período' }).click();
  release();
  await expect(page).toHaveURL(/fromDate=2026-10-01/);
  await expect(page.getByText('Lista para exportar', { exact: true })).toBeVisible();
  expect(downloads).toBe(0);
});
