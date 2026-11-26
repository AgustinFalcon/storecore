import { Route } from '@angular/router';
import { routes } from './app.routes';
import {
  bindProductiveRealRoutes, productiveHttpRouteBindings, productiveRedirectManifest,
  productiveRouteDefinitions, productiveRouteManifest, productiveWildcardManifest,
  RouteActionClass, RouteActor, RouteEvidenceMode, RouteGateResult, RouteScenario,
} from './features/navigation/productive-route-manifest';
import { assertProductiveRouteCoverage, censusProductiveRoutes } from './features/navigation/productive-route-architecture';
import { RealRouteReceipt } from './features/navigation/real-fixture-receipt';

function receiptWire() {
  return { schemaVersion: 1, scenarioPrefix: 'matrix',
    products: [{ productId: '907', variantId: '2113', sku: 'REAL-SKU / 7', name: 'Producto persistido' }],
    customerId: 881, customerEmail: 'owner@example.test', addressId: '1907', addressRevision: '2026-11-14T13:45:17Z',
    addressStreet: 'Calle persistida', pendingOrderId: '8001', offerId: 799,
    cart: { revision: 'revision-from-backend', skus: ['REAL-SKU / 7'] }, homeTitle: 'Inicio persistido',
    notification: { id: '77777777-7777-4777-8777-777777777777', sourceId: 'Persisted-stock-17' },
    commercialCalendar: { eventId: '22222222-2222-4222-8222-222222222222', title: 'PSD calendario comercial' },
    scenarios: [RouteScenario.Populated, RouteScenario.Empty, RouteScenario.InvalidSecret].map(scenario =>
      ({ scenario: scenario.wire, evidence: RouteEvidenceMode.RealBackend.wire })),
  };
}
const realBindings = () => bindProductiveRealRoutes(RealRouteReceipt.fromWire(receiptWire()));
function check(tree: readonly Route[] = routes, definitions = productiveRouteDefinitions,
  http = productiveHttpRouteBindings, real = realBindings(),
  redirects = [...productiveRedirectManifest.entries()], wildcards: readonly string[] = productiveWildcardManifest): void {
  assertProductiveRouteCoverage(tree, definitions, http, real, redirects, wildcards);
}

describe('productive route acceptance contract', () => {
  it('reconciles 37 leaves, four redirects and three wildcards with both evidence sources', () => {
    const actual = censusProductiveRoutes(routes);
    expect(actual.leaves).toHaveLength(37); expect(actual.redirects).toHaveLength(4); expect(actual.wildcards).toHaveLength(3);
    check();
    expect(productiveRouteManifest).toBe(productiveHttpRouteBindings);
    expect(productiveRouteDefinitions.every(entry => !('url' in entry) && !('evidence' in entry))).toBe(true);
  });
  it('rejects missing, duplicate, orphan or unknown definitions and bindings', () => {
    const real = realBindings();
    for (const bindings of [real.slice(1), [...real, real[0]], [...real.slice(1), { ...real[0], pattern: 'orphan' }]]) {
      expect(() => check(routes, productiveRouteDefinitions, productiveHttpRouteBindings, bindings)).toThrow();
      expect(() => check(routes, productiveRouteDefinitions, bindings)).toThrow();
    }
    expect(() => check(routes, productiveRouteDefinitions.slice(1))).toThrow();
    expect(() => check(routes, [...productiveRouteDefinitions, productiveRouteDefinitions[0]])).toThrow();
    expect(() => check(routes, [{ ...productiveRouteDefinitions[0], actor: RouteActor.Unknown }, ...productiveRouteDefinitions.slice(1)])).toThrow(/Unknown/);
    expect(() => check(routes, productiveRouteDefinitions, productiveHttpRouteBindings,
      [{ ...real[0], evidence: RouteEvidenceMode.Unknown }, ...real.slice(1)])).toThrow();
  });
  it('rejects missing/duplicate redirects and wildcards, duplicate tree entries and lazy child trees', () => {
    const real = realBindings(), redirects = [...productiveRedirectManifest.entries()];
    expect(() => check(routes, productiveRouteDefinitions, productiveHttpRouteBindings, real, redirects.slice(1))).toThrow();
    expect(() => check(routes, productiveRouteDefinitions, productiveHttpRouteBindings, real, [...redirects, redirects[0]])).toThrow();
    expect(() => check(routes, productiveRouteDefinitions, productiveHttpRouteBindings, real, redirects, ['**'])).toThrow();
    expect(() => check([...routes, routes[0]])).toThrow();
    expect(() => censusProductiveRoutes([{ path: 'future', loadChildren: async () => [] }])).toThrow(/loadChildren/);
  });
  it('translates finite sets and fails closed for unknown and malformed wires', () => {
    for (const type of [RouteActor, RouteScenario, RouteEvidenceMode, RouteActionClass, RouteGateResult]) {
      for (const item of type.all) expect(type.fromWire(item.wire)).toBe(item);
      for (const raw of ['FUTURE', null, {}, 1, '']) expect(type.fromWire(raw)).toBe(type.Unknown);
    }
    expect(RouteActor.Operator.role?.isKnown).toBe(true);
    expect(RouteActor.ForeignCustomer.context).toBe(RouteActor.Customer.context);
  });
  it('resolves real identities and sanitised final URLs without relabelling HTTP bindings', () => {
    const real = realBindings();
    expect(real.find(row => row.pattern === 'catalog/:sku')?.url).toBe('/catalog/REAL-SKU%20%2F%207');
    expect(real.find(row => row.pattern === 'customer/orders/:id')?.heading).toBe('Orden 8001');
    expect(real[0].heading).toBe('Inicio');
    expect(real[0].readiness).toContain('Inicio persistido');
    expect(real.every(row => row.evidence === RouteEvidenceMode.RealBackend)).toBe(true);
    expect(productiveHttpRouteBindings.every(row => row.evidence === RouteEvidenceMode.HttpFixture)).toBe(true);
    for (const pattern of ['reset-password', 'verify-email']) {
      expect(real.find(row => row.pattern === pattern)?.url).toContain('a'.repeat(43));
      expect(real.find(row => row.pattern === pattern)?.finalUrl).toBe(`/${pattern}`);
      expect(productiveHttpRouteBindings.find(row => row.pattern === pattern)?.finalUrl).toBe(`/${pattern}`);
    }
    expect(real.find(row => row.pattern === 'user/home')?.readiness).toContain('Indicadores');
    expect(real.find(row => row.pattern === 'user/promos')?.readiness).toContain('REAL-SKU / 7');
    expect(real.find(row => row.pattern === 'user/mercadolibre')?.readiness).toBe('#ml-disabled-title');
    expect(real.find(row => row.pattern === 'user/notifications')?.actor).toBe(RouteActor.Operator);
    expect(real.find(row => row.pattern === 'user/notifications/:alertId')?.url).toContain(receiptWire().notification.id);
    expect(real.find(row => row.pattern === 'user/notifications')?.readiness).toContain(receiptWire().notification.sourceId);
  });
  it('copies and freezes receipt data at the boundary', () => {
    const wire = receiptWire(), receipt = RealRouteReceipt.fromWire(wire);
    wire.products[0].sku = 'changed'; wire.cart.skus.push('changed');
    expect(receipt.products[0].sku).toBe('REAL-SKU / 7'); expect(receipt.cart.skus).toHaveLength(1);
    expect(Object.isFrozen(receipt)).toBe(true); expect(Object.isFrozen(receipt.products[0])).toBe(true);
  });
  it('rejects malformed receipts and unavailable scenarios without defaults', () => {
    const invalid: unknown[] = [null, {}, { ...receiptWire(), schemaVersion: 2 },
      { ...receiptWire(), pendingOrderId: null }, { ...receiptWire(), products: [] },
      { ...receiptWire(), addressRevision: 'future' }, { ...receiptWire(), customerId: 0 },
      { ...receiptWire(), homeTitle: '' }, { ...receiptWire(), addressId: '../1' },
      { ...receiptWire(), notification: { id: '00000000-0000-0000-0000-000000000000', sourceId: 'missing' } },
      { ...receiptWire(), cart: { revision: '', skus: ['REAL-SKU / 7'] } },
      { ...receiptWire(), cart: { revision: 'revision', skus: ['foreign'] } },
      { ...receiptWire(), products: [{ ...receiptWire().products[0], sku: 'ROUTE-SKU-1' }],
        cart: { revision: 'revision', skus: ['ROUTE-SKU-1'] } },
      { ...receiptWire(), products: [receiptWire().products[0], receiptWire().products[0]] },
      { ...receiptWire(), scenarios: [{ scenario: 'FUTURE', evidence: RouteEvidenceMode.RealBackend.wire }] },
      { ...receiptWire(), scenarios: [{ scenario: RouteScenario.Populated.wire, evidence: RouteEvidenceMode.RealBackendLocalProvider.wire }] }];
    for (const raw of invalid) expect(() => RealRouteReceipt.fromWire(raw)).toThrow();
    expect(() => bindProductiveRealRoutes(RealRouteReceipt.fromWire({ ...receiptWire(), scenarios: receiptWire().scenarios.slice(0, 1) }))).toThrow(/scenario/);
    expect(() => bindProductiveRealRoutes({} as RealRouteReceipt)).toThrow();
    expect(() => bindProductiveRealRoutes(RealRouteReceipt.fromWire({ ...receiptWire(), notification: undefined }))).toThrow(/notification/);
    expect(() => bindProductiveRealRoutes(RealRouteReceipt.fromWire({ ...receiptWire(), commercialCalendar: undefined }))).toThrow(/calendar/);
  });
});
