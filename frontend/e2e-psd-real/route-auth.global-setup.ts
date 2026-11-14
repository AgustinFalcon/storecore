import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, request, type FullConfig } from '@playwright/test';
import { RouteActor } from '../src/app/features/navigation/productive-route-manifest';
import { RealRouteReceipt } from '../src/app/features/navigation/real-fixture-receipt';

const passwordByActor = new Map<RouteActor, string>([
  [RouteActor.Customer, 'StoreCore-showcase-2026!'],
  [RouteActor.Admin, 'PSD-disposable-fixture-2026!'],
]);

export default async function routeAuthSetup(config: FullConfig): Promise<void> {
  const authDir = process.env['STORECORE_PSD_AUTH_DIR'];
  if (!authDir) throw new Error('Missing ephemeral route auth directory');
  mkdirSync(authDir, { recursive: true });
  const receipt = RealRouteReceipt.fromWire(JSON.parse(readFileSync(resolve('psd-real-results/fixture-receipt.json'), 'utf8')));
  const baseURL = config.projects[0]?.use.baseURL;
  if (typeof baseURL !== 'string') throw new Error('Missing productive route base URL');

  for (const actor of [RouteActor.Customer, RouteActor.Admin]) {
    const context = await request.newContext({ baseURL, ignoreHTTPSErrors: true,
      extraHTTPHeaders: { Origin: baseURL } });
    try {
      const realm = actor === RouteActor.Customer ? 'customer' : 'internal';
      const response = await context.post(`/api/v1/${realm}/auth/login`, { data: {
        email: actor === RouteActor.Customer ? receipt.customerEmail : 'psd-route-admin@storecore.invalid',
        password: passwordByActor.get(actor),
      } });
      expect(response.status()).toBe(200);
      await context.storageState({ path: join(authDir, `${actor.wire}.json`) });
    } finally { await context.dispose(); }
  }
}
