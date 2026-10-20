import { DemoCommerce, decodeSnapshot, demoSeed, DemoScenario } from './demo-model';
import { DemoMLAccountStatus, DemoMappingStatus, DemoObservationStatus, DemoMarketplaceMapping, DemoMarketplaceProcessor, DemoMarketplaceProjection, competitorFreshness, ensureCompetitorDetails, ensureMarketplace } from './demo-marketplace';
import { DemoSyncStatus } from './demo-process-types';
import { DemoInboxPolicy, DemoAlertRead, DemoAlertResolution, DemoAlertCategory } from './demo-inbox';
import { checkoutFixture } from './checkout/checkout-test-fixture';
import type { DemoMarketplaceSnapshot } from './demo-marketplace';
import { ProductPublication, VariantSaleState } from './catalog/catalog-types';
import { DemoMarketplaceSale, DemoCompetitorAvailabilityStep, DemoMarketSignalRead, decodeMarketplace, type DemoMarketplaceSalePort } from './demo-marketplace';

const now = '2026-10-09T10:00:00.000Z';
const setup = () => new DemoCommerce(demoSeed(), () => now, () => 'operation-fixed');
describe('FE-COMP-06 marketplace simulator invariants', () => {
  it('rejects omitted domain variant identity even with multiple valid mappings and leaves every stock untouched', () => {
    const { product } = checkoutFixture();
    const snapshot: DemoMarketplaceSnapshot = { products: [product], listings: [{ sku: product.sku, linked: true, error: false }], mlConnected: true, competitors: [] };
    new DemoMarketplaceMapping().save(snapshot, product.sku, product.variants[1].id, 'SIM-second', 'SIM-second', now);
    const port: DemoMarketplaceSalePort = { snapshot, movements: [], consume: (_sku, id) => { product.variants.find(value => value.id === id)!.onHand--; } };
    const before = JSON.stringify(port);
    expect(() => new DemoMarketplaceSale().apply(port, product.sku, 'omitted', now, undefined as unknown as string)).toThrow('identidad');
    expect(JSON.stringify(port)).toBe(before);
  });
  it('legacy sale adapter refuses ambiguous eligible variants instead of choosing the first mapping', () => {
    const commerce = setup(); commerce.setMLAccount(DemoMLAccountStatus.Authorized);
    const market = commerce.snapshot.marketplace!;
    market.mappings.push({ ...market.mappings[0], id: 'another', variantId: 'different', variationId: 'SIM-different' });
    const before = JSON.stringify(commerce.snapshot);
    expect(() => commerce.mlSale('DEMO-001', 'omitted')).toThrow('explícita');
    expect(JSON.stringify(commerce.snapshot)).toBe(before);
  });
  it('Unknown account blocks unlink before changing the mapping, queue or persisted snapshot', () => {
    const commerce = setup(); commerce.setMLAccount(DemoMLAccountStatus.Authorized);
    const market = commerce.snapshot.marketplace!; market.account = DemoMLAccountStatus.Unknown;
    const before = JSON.stringify(commerce.snapshot);
    expect(() => commerce.unlinkML(market.mappings[0].id)).toThrow('desconocida');
    expect(JSON.stringify(commerce.snapshot)).toBe(before);
    expect(market.account.canManageMappings).toBe(false);
  });
  it('availability policy rejects current or target Unknown without changing persistence', () => {
    const commerce = setup(); const competitor = commerce.snapshot.competitors[0]; const details = ensureCompetitorDetails(competitor, commerce.snapshot);
    const step = new DemoCompetitorAvailabilityStep();
    for (const current of [DemoObservationStatus.Recent, DemoObservationStatus.Unknown]) {
      details.availability = current;
      for (const target of [DemoObservationStatus.Stale, DemoObservationStatus.Unknown]) {
        if (current !== DemoObservationStatus.Unknown && target !== DemoObservationStatus.Unknown) continue;
        const before = JSON.stringify(commerce.snapshot);
        expect(current.canTransitionTo(target)).toBe(false);
        expect(() => step.apply(commerce.snapshot, competitor.id, target)).toThrow('desconocida');
        expect(JSON.stringify(commerce.snapshot)).toBe(before);
      }
    }
    details.availability = DemoObservationStatus.Recent;
    commerce.competitorAvailability(competitor.id, DemoObservationStatus.Stale);
    expect(details.availability).toBe(DemoObservationStatus.Stale);
  });
  for (const version of [1, 4]) it(`migrates v${version} historical ML replay without consuming again or accepting another SKU`, () => {
    const seed = demoSeed(); seed.version = version; seed.mlConnected = true;
    seed.products[0].onHand--; seed.movements.push({ id: 'historical-sale', sku: seed.products[0].sku, delta: -1, reason: 'Venta Mercado Libre simulada' });
    seed.movements.push({ id: 'other-operation', sku: seed.products[0].sku, delta: -1, reason: 'Ajuste manual' });
    const commerce = new DemoCommerce(decodeSnapshot(JSON.stringify(seed)));
    const before = JSON.stringify(commerce.snapshot);
    commerce.mlSale(seed.products[0].sku, 'historical-sale');
    expect(JSON.stringify(commerce.snapshot)).toBe(before);
    expect(commerce.snapshot.movements[1].variantId).toBeUndefined();
    expect(() => commerce.mlSale(seed.products[1].sku, 'historical-sale')).toThrow('otra variante');
    expect(JSON.stringify(commerce.snapshot)).toBe(before);
  });
  it('new inbox alerts inherit persisted signal reading after preferences were paused while resolution stays active', () => {
    const commerce = setup(); const inbox = new DemoInboxPolicy(); const competitor = commerce.snapshot.competitors[0];
    inbox.preference(commerce.snapshot, 'admin', DemoAlertCategory.Marketplace, false);
    commerce.competitorPrice(competitor.id, competitor.price - 50000, 'paused-signal');
    competitor.details!.signals[0].read = DemoMarketSignalRead.Read;
    const restored = decodeSnapshot(JSON.stringify(commerce.snapshot));
    inbox.preference(restored, 'admin', DemoAlertCategory.Marketplace, true); inbox.reconcile(restored, now);
    const alert = restored.inbox!.alerts.find(value => value.id.includes('paused-signal'))!;
    expect(alert.read).toBe(DemoAlertRead.Read); expect(alert.resolution).toBe(DemoAlertResolution.Active);
    inbox.reconcile(restored, now);
    expect(restored.inbox!.alerts.filter(value => value.id === alert.id)).toHaveLength(1);
  });
  it('projects modular variant reservations and not-sellable stock without composing the runtime', () => {
    const { product } = checkoutFixture();
    const state: DemoMarketplaceSnapshot = { products: [product], listings: [{ sku: product.sku, linked: true, error: false }], mlConnected: true, competitors: [] };
    const market = ensureMarketplace(state, now); const mapping = market.mappings[0];
    new DemoMarketplaceMapping().save(state, product.sku, product.variants[1].id, 'SIM-second', 'SIM-second', now);
    new DemoMarketplaceProcessor().process(state, now);
    const confirmed = mapping.confirmed;
    product.variants[0].reserved = 2; product.variants[0].notSellable = 1;
    new DemoMarketplaceProjection().refresh(state, now);
    expect(mapping.local).toBe(7); expect(mapping.desired).toBe(7); expect(mapping.confirmed).toBe(confirmed);
    expect(market.mappings[1].local).toBe(5);
    product.variants[0].saleState = VariantSaleState.Unknown;
    new DemoMarketplaceProjection().refresh(state, now); expect(mapping.desired).toBe(0);
    product.publication = ProductPublication.Unknown;
    new DemoMarketplaceProjection().refresh(state, now); expect(market.mappings[1].desired).toBe(0);
  });
  it('uses composite SKU/variant identities when different products reuse a variant ID', () => {
    const { product } = checkoutFixture(); const other = { ...product, sku: 'TEST-2', variants: product.variants.map(value => ({ ...value })) };
    const state: DemoMarketplaceSnapshot = { products: [product, other], listings: [product, other].map(value => ({ sku: value.sku, linked: true, error: false })), mlConnected: true, competitors: [] };
    const market = ensureMarketplace(state, now);
    expect(new Set(market.mappings.map(value => value.id)).size).toBe(2);
    new DemoMarketplaceMapping().save(state, other.sku, other.variants[0].id, 'SIM-other', 'SIM-other', now);
    expect(market.mappings).toHaveLength(2); expect(market.mappings[0].listingId).toBe('SIM-TEST-1');
  });
  for (const separator of ['-', ':']) it(`keeps composite identity unambiguous when catalog data contains ${separator}`, () => {
    const { product } = checkoutFixture();
    const first = { ...product, sku: `A${separator}B`, variants: [{ ...product.variants[0], id: 'C' }] };
    const second = { ...product, sku: 'A', variants: [{ ...product.variants[0], id: `B${separator}C` }] };
    const state: DemoMarketplaceSnapshot = { products: [first, second], listings: [first, second].map(value => ({ sku: value.sku, linked: true, error: false })), mlConnected: true, competitors: [] };
    const market = ensureMarketplace(state, now);
    expect(new Set(market.mappings.map(value => value.id)).size).toBe(2);
    const restored = JSON.parse(JSON.stringify(state)) as DemoMarketplaceSnapshot;
    // Catalog state rehydration belongs to its own translator; this boundary receives canonical catalog values.
    restored.products = state.products;
    expect(() => decodeMarketplace(restored)).not.toThrow();
  });
  it('deduplicates an exact modular variant sale before checking exhausted stock and rejects cross-variant replay', () => {
    const { product } = checkoutFixture(); product.variants[1].onHand = 1;
    const snapshot: DemoMarketplaceSnapshot = { products: [product], listings: [{ sku: product.sku, linked: true, error: false }], mlConnected: true, competitors: [] };
    new DemoMarketplaceMapping().save(snapshot, product.sku, product.variants[1].id, 'SIM-second', 'SIM-second', now);
    const port: DemoMarketplaceSalePort = { snapshot, movements: [], consume: (_sku, id) => { product.variants.find(value => value.id === id)!.onHand--; } };
    const sale = new DemoMarketplaceSale();
    expect(sale.apply(port, product.sku, 'sale', now, product.variants[1].id)).toBe(true); expect(sale.apply(port, product.sku, 'sale', now, product.variants[1].id)).toBe(false);
    expect(product.variants[0].onHand).toBe(10); expect(product.variants[1].onHand).toBe(0); expect(port.movements).toHaveLength(1);
    expect(() => sale.apply(port, product.sku, 'sale', now, product.variants[0].id)).toThrow('otra variante');
    expect(() => sale.apply(port, product.sku, 'new-sale', now, product.variants[1].id)).toThrow('sin stock');
    expect(() => sale.apply(port, product.sku, 'blank', now, '')).toThrow('identidad');
  });
  it('closes unknown wire values and rehydrates only canonical cases', () => { expect(DemoMLAccountStatus.fromWire('live')).toBe(DemoMLAccountStatus.Unknown); expect(DemoMappingStatus.fromWire('magic')).toBe(DemoMappingStatus.Unknown); expect(DemoObservationStatus.fromWire('scraped')).toBe(DemoObservationStatus.Unknown); const commerce = setup(); commerce.setMLAccount(DemoMLAccountStatus.Paused); const state = decodeSnapshot(JSON.stringify(commerce.snapshot)); expect(state.version).toBe(5); expect(state.marketplace!.account).toBe(DemoMLAccountStatus.Paused); expect(state.marketplace!.mappings[0].status).toBe(DemoMappingStatus.Linked); });
  it('migrates v4 legacy listings into explicit variant identities without inventing observed or confirmed stock', () => { const seed = demoSeed(); const decoded = decodeSnapshot(JSON.stringify(seed)); const mapping = decoded.marketplace!.mappings[0]; expect(mapping.variantId).toBe(`${seed.products[0].sku}:standard`); expect(mapping.listingId).toBe('SIM-DEMO-001'); expect(mapping.observed).toBeUndefined(); expect(mapping.confirmed).toBeUndefined(); expect(decoded.marketplace!.account).toBe(DemoMLAccountStatus.Disconnected); });
  it('rejects corrupt v5 instead of silently migrating it', () => { const seed = demoSeed(); seed.version = 5; expect(() => decodeSnapshot(JSON.stringify(seed))).toThrow('Falta el canal'); const commerce = setup(); commerce.setMLAccount(DemoMLAccountStatus.Authorized); commerce.snapshot.marketplace!.mappings[0].desired = -1; expect(() => decodeSnapshot(JSON.stringify(commerce.snapshot))).toThrow('Mapping'); });
  it('retains debt through pause, expired and error, then converges exactly once', () => { const commerce = setup(); commerce.setMLAccount(DemoMLAccountStatus.Authorized); commerce.processStock(); const mapping = commerce.snapshot.marketplace!.mappings[0]; const originalConfirmed = mapping.confirmed; for (const state of [DemoMLAccountStatus.Paused, DemoMLAccountStatus.Expired, DemoMLAccountStatus.Error]) { commerce.setMLAccount(state); commerce.adjust(mapping.sku, 1, 'Ingreso'); expect(mapping.confirmed).toBe(originalConfirmed); expect(() => commerce.processStock()).toThrow('deuda'); } commerce.setMLAccount(DemoMLAccountStatus.Authorized); commerce.processStock(true); expect(mapping.confirmed).toBe(originalConfirmed); expect(commerce.snapshot.marketplace!.queue.some(value => value.status === DemoSyncStatus.Failed)).toBe(true); commerce.processStock(); expect(mapping.confirmed).toBe(mapping.local); const queue = JSON.stringify(commerce.snapshot.marketplace!.queue); commerce.processStock(); expect(JSON.stringify(commerce.snapshot.marketplace!.queue)).toBe(queue); });
  it('maps by variant identity and blocks duplicate provider targets atomically', () => { const commerce = setup(); const other = { sku: 'DEMO-002', id: 'DEMO-002:standard' }; const mapping = ensureMarketplace(commerce.snapshot).mappings[0]; const before = JSON.stringify(commerce.snapshot); expect(() => commerce.mapML(other.sku, other.id, mapping.listingId, mapping.variationId)).toThrow('Conflicto'); expect(JSON.stringify(commerce.snapshot)).toBe(before); commerce.mapML(other.sku, other.id, mapping.listingId, 'SIM-distinct-variation'); commerce.setMLAccount(DemoMLAccountStatus.Authorized); const original = commerce.available(other.sku); commerce.mlSale(other.sku, 'sale-variant', other.id); const saved = JSON.stringify(commerce.snapshot); commerce.mlSale(other.sku, 'sale-variant', other.id); expect(JSON.stringify(commerce.snapshot)).toBe(saved); expect(commerce.available(other.sku)).toBe(original - 1); expect(commerce.snapshot.movements.filter(value => value.id === 'sale-variant')).toHaveLength(1); });
  it('blocks stock underflow and a sale operation reused for another variant', () => { const commerce = setup(); commerce.setMLAccount(DemoMLAccountStatus.Authorized); commerce.mlSale('DEMO-001', 'sale'); expect(() => commerce.mlSale('DEMO-002', 'sale')).toThrow('otra variante'); const mapping = commerce.snapshot.marketplace!.mappings[0]; commerce.adjust(mapping.sku, -commerce.available(mapping.sku), 'Agotado'); expect(() => commerce.mlSale(mapping.sku, 'another')).toThrow('sin stock'); });
  it('reserves web stock into desired, supersedes old generations and preserves observed', () => { const commerce = setup(); commerce.setMLAccount(DemoMLAccountStatus.Authorized); commerce.processStock(); const mapping = commerce.snapshot.marketplace!.mappings[0]; const observed = mapping.observed; commerce.add('cliente', mapping.sku, 2); commerce.checkout('cliente', 'pending-reserve', 'address-cliente', DemoScenario.Pending); expect(mapping.local).toBe(observed! - 2); expect(mapping.desired).toBe(mapping.local); expect(mapping.observed).toBe(observed); commerce.cancelPayment(commerce.snapshot.orders.at(-1)!.id); expect(mapping.local).toBe(observed); expect(commerce.snapshot.marketplace!.queue.some(value => value.status === DemoSyncStatus.Superseded)).toBe(true); });
  it('detects persisted conflicts and excludes them from processing', () => { const commerce = setup(); commerce.setMLAccount(DemoMLAccountStatus.Authorized); const state = commerce.snapshot; state.marketplace!.mappings[1].listingId = state.marketplace!.mappings[0].listingId; state.marketplace!.mappings[1].variationId = state.marketplace!.mappings[0].variationId; const decoded = decodeSnapshot(JSON.stringify(state)); expect(decoded.marketplace!.mappings[0].status).toBe(DemoMappingStatus.Conflict); new DemoMarketplaceProcessor().process(decoded, now); expect(decoded.marketplace!.mappings[0].confirmed).toBeUndefined(); });
  it('unlinks a mapping without losing history and remaps with new generation', () => { const commerce = setup(); commerce.setMLAccount(DemoMLAccountStatus.Authorized); const mapping = commerce.snapshot.marketplace!.mappings[0]; commerce.unlinkML(mapping.id); expect(mapping.status).toBe(DemoMappingStatus.Unlinked); expect(() => commerce.mlSale(mapping.sku, 'unlinked')).toThrow(); new DemoMarketplaceMapping().save(commerce.snapshot, mapping.sku, mapping.variantId, 'SIM-remapped', 'SIM-new', now); expect(mapping.generation).toBe(1); new DemoMarketplaceProjection().refresh(commerce.snapshot, now); expect(commerce.snapshot.marketplace!.queue.filter(value => value.mappingId === mapping.id && value.status === DemoSyncStatus.Queued)).toHaveLength(1); });
  it('dates competitor observations and deduplicates alerts without changing own prices', () => { const commerce = setup(); const competitor = commerce.snapshot.competitors[0]; const own = commerce.product('DEMO-001').price; commerce.competitorPrice(competitor.id, competitor.price - 50000, 'price-event'); const length = competitor.history.length; commerce.competitorPrice(competitor.id, competitor.price, 'price-event'); expect(competitor.history).toHaveLength(length); expect(competitor.details!.signals).toHaveLength(1); expect(commerce.product('DEMO-001').price).toBe(own); expect(competitorFreshness(competitor, commerce.snapshot, '2026-10-11T10:00:00Z')).toBe(DemoObservationStatus.Stale); competitor.details!.availability = DemoObservationStatus.Unavailable; expect(competitorFreshness(competitor, commerce.snapshot, now)).toBe(DemoObservationStatus.Unavailable); });
  it('reading an alert does not resolve its commercial signal or create duplicate inbox alerts', () => { const commerce = setup(); const competitor = commerce.snapshot.competitors[0]; commerce.competitorPrice(competitor.id, competitor.price - 50000, 'price-event'); const inbox = new DemoInboxPolicy(); inbox.reconcile(commerce.snapshot, now); const alert = commerce.snapshot.inbox!.alerts.find(value => value.id.includes('price-event'))!; inbox.mark(commerce.snapshot, 'admin', alert.id, DemoAlertRead.Read); inbox.reconcile(commerce.snapshot, now); expect(alert.resolution).toBe(DemoAlertResolution.Active); expect(alert.read).toBe(DemoAlertRead.Read); expect(commerce.snapshot.inbox!.alerts.filter(value => value.id === alert.id)).toHaveLength(1); });
  it('respects threshold, paused alerts and explicit price replay conflict', () => { const commerce = setup(); const competitor = commerce.snapshot.competitors[0]; competitor.threshold = 100; commerce.competitorPrice(competitor.id, competitor.price - 100, 'small'); expect(ensureCompetitorDetails(competitor, commerce.snapshot).signals).toHaveLength(0); competitor.enabled = false; competitor.threshold = 1; commerce.competitorPrice(competitor.id, competitor.price - 50000, 'disabled'); expect(competitor.details!.signals).toHaveLength(0); expect(() => commerce.competitorPrice(competitor.id, competitor.price + 100, 'disabled')).toThrow('otro precio'); });
});
