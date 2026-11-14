import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { productiveRouteManifest, RouteEvidenceMode } from '../src/app/features/navigation/productive-route-manifest';
import { installProductiveRouteFixture } from './support/productive-route-fixture';

for (const viewport of [{ name: 'mobile', width: 390, height: 1000 }, { name: 'desktop', width: 1440, height: 1000 }]) {
  for (const acceptance of productiveRouteManifest) {
    test(`${viewport.name} accepts productive route ${acceptance.pattern || '/'}`, async ({ page }) => {
      expect(acceptance.evidence).toBe(RouteEvidenceMode.HttpFixture);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const evidence = await installProductiveRouteFixture(page, acceptance.actor);

      await page.goto(acceptance.url, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('sc-root')).toHaveAttribute('data-surface-id', acceptance.surface.wire);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(acceptance.heading);
      await expect(page.locator(acceptance.readiness).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeAttached();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      const result = await new AxeBuilder({ page }).analyze();
      const blocking = result.violations.filter(item => item.impact === 'serious' || item.impact === 'critical');
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
      expect(evidence.unhandled, 'all productive reads must be explicitly fixture-backed').toEqual([]);
      expect(evidence.writes, 'route acceptance must not trigger mutations').toEqual([]);
    });
  }
}

test('HTTP fixture blocks version drift, cross-origin traffic and beacon writes', async ({ page }) => {
  const evidence = await installProductiveRouteFixture(page, productiveRouteManifest[0].actor);
  await page.goto('/login');
  const beaconRequest = page.waitForRequest(request => request.url().endsWith('/telemetry'));
  await page.evaluate(async () => {
    await fetch('/api/v2/unexpected', { method: 'POST' }).catch(() => undefined);
    await fetch('https://example.test/api/v1/escape').catch(() => undefined);
    navigator.sendBeacon('/telemetry', 'unexpected');
  });
  await beaconRequest;
  await expect.poll(() => evidence.writes).toContain(`POST ${new URL(page.url()).origin}/telemetry`);
  expect(evidence.writes).toEqual([
    `POST ${new URL(page.url()).origin}/api/v2/unexpected`,
    `POST ${new URL(page.url()).origin}/telemetry`,
  ]);
  expect(evidence.unhandled).toEqual([
    `POST ${new URL(page.url()).origin}/api/v2/unexpected`,
    'GET https://example.test/api/v1/escape',
    `POST ${new URL(page.url()).origin}/telemetry`,
  ]);
});
