import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url), cache = new Map();
function loadTs(relative, parentRequire = require) {
  const filename = parentRequire.resolve(relative);
  if (cache.has(filename)) return cache.get(filename);
  const module = { exports: {} }, localRequire = createRequire(filename);
  cache.set(filename, module.exports);
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', source)(name => {
    if (name.startsWith('.') && !name.endsWith('.json')) return loadTs(`${name}.ts`, localRequire);
    return localRequire(name);
  }, module, module.exports);
  return module.exports;
}
const { RealRouteReceipt } = loadTs('../src/app/features/navigation/real-fixture-receipt.ts');
const { bindProductiveRealRoutes } = loadTs('../src/app/features/navigation/productive-route-manifest.ts');
const { requiredReads } = loadTs('../e2e-psd-real/route-matrix-support.ts');
const eventId = '22222222-2222-4222-8222-222222222222';
function wire() {
  return { schemaVersion: 1, scenarioPrefix: 'matrix',
    products: [{ productId: '7', variantId: '9', sku: 'PERSISTED', name: 'Persistido' }],
    customerId: 8, customerEmail: 'owner@example.test', addressId: '10', addressRevision: '2026-11-14T13:45:17Z',
    addressStreet: 'Calle persistida', pendingOrderId: '11', offerId: 12,
    cart: { revision: 'revision-from-backend', skus: ['PERSISTED'] }, homeTitle: 'Inicio persistido',
    notification: { id: '77777777-7777-4777-8777-777777777777', sourceId: '17' },
    commercialCalendar: { eventId, title: 'PSD calendario comercial' },
    scenarios: ['POPULATED', 'EMPTY', 'INVALID_SECRET'].map(scenario => ({ scenario, evidence: 'REAL_BACKEND' })),
  };
}
test('calendar receipt rejects malformed or noncanonical persisted IDs and extra fields', () => {
  for (const eventId of ['', '42', '00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-22222222222A']) {
    assert.throws(() => RealRouteReceipt.fromWire({ ...wire(), commercialCalendar: { eventId, title: 'Persistido' } }));
  }
  assert.throws(() => RealRouteReceipt.fromWire({ ...wire(), commercialCalendar: { ...wire().commercialCalendar, unknown: true } }));
  assert.throws(() => bindProductiveRealRoutes(RealRouteReceipt.fromWire({ ...wire(), commercialCalendar: undefined })), /persisted calendar/);
});
test('all four real routes bind deterministic month state, persisted identity and exact read ownership', () => {
  const receipt = RealRouteReceipt.fromWire(wire()), bindings = bindProductiveRealRoutes(receipt);
  assert.equal(bindings.length, 36);
  const calendar = bindings.filter(binding => binding.pattern.startsWith('user/commercial-calendar'));
  assert.equal(calendar.length, 4);
  const ownReads = [['user/commercial-calendar/events'], [], [`user/commercial-calendar/events/${eventId}`], [`user/commercial-calendar/events/${eventId}`]];
  calendar.forEach((binding, index) => {
    const url = new URL(binding.url, 'https://localhost');
    assert.deepEqual([...url.searchParams], [['view', 'month'], ['month', '2026-11'], ['zone', 'America/Argentina/Buenos_Aires'], ['page', '0'], ['size', '25']]);
    assert.deepEqual(requiredReads(binding, receipt).map(read => read.path), ['health', 'storefront/branding', ...ownReads[index]]);
    assert.equal(binding.evidence.wire, 'REAL_BACKEND');
  });
  assert.match(calendar[2].url, new RegExp(eventId));
  assert.match(calendar[3].url, new RegExp(`${eventId}/edit`));
});
