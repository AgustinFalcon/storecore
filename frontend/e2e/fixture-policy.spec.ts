import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { installApiFixtures } from './api-fixtures';
import { ScreenRealm } from './route-manifest';

enum RequestAction { Aborted, Fulfilled, Continued }
enum Method { Get = 'GET', Post = 'POST' }
enum Handler { CatchAll, Api }
enum Resource { Stylesheet = 'stylesheet', Fetch = 'fetch' }

async function invokeApiHandler(url: string, realm = ScreenRealm.Public, method = Method.Get,
  handler = Handler.Api, resource = Resource.Fetch) {
  const handlers: Array<(route: Route) => Promise<void>> = [];
  const page = {
    addInitScript: async () => undefined,
    route: async (_pattern: string, handler: (route: Route) => Promise<void>) => { handlers.push(handler); },
  } as unknown as Page;
  const api = await installApiFixtures(page, realm);
  const actions: RequestAction[] = [];
  const statuses: number[] = [];
  const route = {
    request: () => ({ url: () => url, method: () => method, resourceType: () => resource }),
    abort: async () => { actions.push(RequestAction.Aborted); },
    fulfill: async (response: { status: number }) => { actions.push(RequestAction.Fulfilled); statuses.push(response.status); },
    continue: async () => { actions.push(RequestAction.Continued); },
  } as unknown as Route;
  // Playwright dispatches the last registered matching handler first.
  await handlers[handler === Handler.Api ? handlers.length - 1 : 0](route);
  return { api, actions, statuses };
}

test('the optional font stylesheet query can vary but its boundary stays offline and exact', async () => {
  const font = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;650;700&display=swap';
  for (const url of [font,
    'https://fonts.googleapis.com/css2?family=Inter%3Awght%40400%3B500%3B600%3B650%3B700&display=swap',
    'https://fonts.googleapis.com/css2?display=swap&family=Inter:wght@400;500;600;650;700',
    'https://fonts.googleapis.com/css2?display=swap&family=Inter%3Awght%40400%3B500%3B600%3B650%3B700',
    'https://fonts.googleapis.com/css2',
    font + '&extra=1',
    font + '&family=Inter%3Awght%40400%3B500%3B600%3B650%3B700',
    font + '&display=swap',
    font.replace('Inter:wght', 'Roboto:wght'),
    font.replace('display=swap', 'display=block'),
    font.replace('&display=swap', ''),
  ]) {
    const result = await invokeApiHandler(url, ScreenRealm.Public, Method.Get, Handler.CatchAll, Resource.Stylesheet);
    expect(result.actions).toEqual([RequestAction.Aborted]);
    expect(result.statuses).toEqual([]);
    expect(result.api.unexpected).toEqual([]);
    expect(result.api.seen.size).toBe(0);
  }
  for (const [url, method, resource] of [
    [font.replace('https:', 'http:'), Method.Get, Resource.Stylesheet],
    [font.replace('fonts.googleapis.com', 'fonts.googleapis.com:444'), Method.Get, Resource.Stylesheet],
    [font.replace('fonts.googleapis.com', 'test@fonts.googleapis.com'), Method.Get, Resource.Stylesheet],
    [font.replace('fonts.googleapis.com', 'test:secret@fonts.googleapis.com'), Method.Get, Resource.Stylesheet],
    [font + '#fragment', Method.Get, Resource.Stylesheet],
    [font.replace('fonts.googleapis.com', 'foreign.example.invalid'), Method.Get, Resource.Stylesheet],
    ['https://fonts.googleapis.com/other.css', Method.Get, Resource.Stylesheet],
    ['https://fonts.googleapis.com/api/v1/health', Method.Get, Resource.Stylesheet],
    [font, Method.Post, Resource.Stylesheet],
    [font, Method.Get, Resource.Fetch],
  ] as const) {
    const rejected = await invokeApiHandler(url, ScreenRealm.Public, method, Handler.CatchAll, resource);
    expect(rejected.actions).toEqual([RequestAction.Aborted]);
    expect(rejected.api.unexpected).toHaveLength(1);
  }
  const api = await invokeApiHandler('https://fonts.googleapis.com/api/v1/health');
  expect(api.actions).toEqual([RequestAction.Aborted]);
  expect(api.api.unexpected).toHaveLength(1);
});

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
