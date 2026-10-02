import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { installApiFixtures } from './api-fixtures';
import { ScreenRealm } from './route-manifest';

enum RequestAction { Aborted, Fulfilled, Continued }
enum Method { Get = 'GET', Post = 'POST' }

async function invokeApiHandler(url: string, realm = ScreenRealm.Public, method = Method.Get) {
  const handlers: Array<(route: Route) => Promise<void>> = [];
  const page = {
    addInitScript: async () => undefined,
    route: async (_pattern: string, handler: (route: Route) => Promise<void>) => { handlers.push(handler); },
  } as unknown as Page;
  const api = await installApiFixtures(page, realm);
  const actions: RequestAction[] = [];
  const statuses: number[] = [];
  const route = {
    request: () => ({ url: () => url, method: () => method }),
    abort: async () => { actions.push(RequestAction.Aborted); },
    fulfill: async (response: { status: number }) => { actions.push(RequestAction.Fulfilled); statuses.push(response.status); },
    continue: async () => { actions.push(RequestAction.Continued); },
  } as unknown as Route;
  // Playwright dispatches the last registered matching handler first.
  await handlers[handlers.length - 1](route);
  return { api, actions, statuses };
}

test('known API paths on a foreign origin never receive fixtures or authentication', async () => {
  for (const origin of ['https://foreign.example.invalid', 'http://127.0.0.1:8080', 'https://127.0.0.1:4300']) {
    for (const path of ['/api/v1/health', '/api/v1/customer/me', '/api/v1/internal/me']) {
      const result = await invokeApiHandler(origin + path, ScreenRealm.Customer);
      expect(result.actions).toEqual([RequestAction.Aborted]);
      expect(result.statuses).toEqual([]);
      expect(result.api.unexpected).toHaveLength(1);
      expect(result.api.seen.size).toBe(0);
    }
  }
});

test('session fixture authentication is scoped to the selected realm on the allowed origin', async () => {
  for (const realm of [ScreenRealm.Public, ScreenRealm.Customer, ScreenRealm.User]) {
    const customer = await invokeApiHandler('http://127.0.0.1:4300/api/v1/customer/me', realm);
    const user = await invokeApiHandler('http://127.0.0.1:4300/api/v1/internal/me', realm);
    expect(customer.statuses).toEqual([realm === ScreenRealm.Customer ? 200 : 401]);
    expect(user.statuses).toEqual([realm === ScreenRealm.User ? 200 : 401]);
    expect(customer.api.unexpected).toEqual([]);
    expect(user.api.unexpected).toEqual([]);
  }
});

test('unexpected reads and writes remain blocked even on the allowed origin', async () => {
  const unknown = await invokeApiHandler('http://127.0.0.1:4300/api/v1/unknown');
  const write = await invokeApiHandler('http://127.0.0.1:4300/api/v1/customer/me', ScreenRealm.Customer, Method.Post);
  for (const result of [unknown, write]) {
    expect(result.actions).toEqual([RequestAction.Aborted]);
    expect(result.api.unexpected).toHaveLength(1);
  }
});
