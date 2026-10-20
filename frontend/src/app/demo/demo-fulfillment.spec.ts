import { checkoutFixture } from './checkout/checkout-test-fixture';
import { DemoCatalogWire } from './catalog/catalog-wire';
import { VariantSaleState } from './catalog/catalog-types';
import { postSaleFixture } from './postsale/postsale-test-fixture';
import { DemoReturnReason } from './postsale/postsale-types';
import { decodeInbox, type DemoInboxSnapshot } from './demo-inbox';
import { DemoCommerce, DemoScenario, decodeSnapshot, demoSeed } from './demo-model';
import { DemoDeliveryMethod, DemoPaymentMethod } from './demo-process-types';
import { DemoFulfillmentAction as Action, DemoFulfillmentPhase as Phase, DemoFulfillmentPolicy, DemoIncidentKind as Incident, ensureFulfillment, decodeFulfillment, type DemoFulfillmentOrder } from './demo-fulfillment';
import { ShipmentStatus } from '../domain/order/shipment-status';
import { DemoAlertCategory as Category, DemoAlertRead as Read, DemoAlertResolution as Resolution, DemoAlertFilter, DemoInboxPolicy } from './demo-inbox';

describe('fulfillment by modality and persistent notification ownership', () => {
  const create = (method: DemoDeliveryMethod) => { const commerce = new DemoCommerce(demoSeed()); commerce.add('cliente', 'DEMO-001', 1); return { commerce, order: commerce.checkout('cliente', 'fulfillment', 'address-cliente', DemoScenario.Approved, DemoPaymentMethod.Card, method) }; };
  it.each(DemoDeliveryMethod.all)('promotes a reconciled modular pending payment only after approval for %s', method => {
    const { snapshot, product, cart } = checkoutFixture();
    product.variants[0].pickupLocation = 'Sucursal Norte · Calle 456';
    cart.add('customer', product.sku, 1, product.variants[0].id);
    const order = cart.checkout('customer', 'pending-fulfillment', 'home', DemoScenario.Pending, DemoPaymentMethod.Card, method);
    const state: DemoInboxSnapshot = { ...snapshot, version: 4, settings: { lowStockThreshold: 5 }, competitors: [] };
    const inbox = new DemoInboxPolicy(); const policy = new DemoFulfillmentPolicy();
    inbox.reconcile(state, 'pending'); const value = ensureFulfillment(order);
    expect(value.phase).toBe(Phase.Pending); expect(policy.actions(order)).toEqual([]);
    // Restore the cached fulfillment as the snapshot boundary does before resolving payment.
    const persisted: DemoFulfillmentOrder = order;
    persisted.fulfillment = JSON.parse(JSON.stringify(value)); decodeFulfillment(persisted);
    expect(ensureFulfillment(order).phase).toBe(Phase.Pending);
    cart.resolvePayment('customer', order.id, DemoScenario.Approved);
    inbox.reconcile(state, 'approved');
    const approved = ensureFulfillment(order);
    expect(approved.phase).toBe(Phase.Preparing);
    expect(policy.actions(order)).toEqual([method === DemoDeliveryMethod.Pickup ? Action.Ready : Action.Dispatch]);
    const movements = snapshot.movements.length; const history = order.history.length;
    inbox.reconcile(state, 'same'); expect(ensureFulfillment(order)).toBe(approved);
    expect(snapshot.movements).toHaveLength(movements); expect(order.history).toHaveLength(history);
    const action = policy.actions(order)[0]; policy.apply(order, action, ''); const count = approved.attempts;
    expect(policy.apply(order, action, '')).toBeUndefined(); expect(approved.attempts).toBe(count);
  });
  it('keeps rejected and cancelled modular pending payments closed without upgrading Unknown', () => {
    for (const reject of [true, false]) {
      const { product, cart } = checkoutFixture(); cart.add('customer', product.sku, 1, product.variants[0].id);
      const order = cart.checkout('customer', 'closed-payment', 'home', DemoScenario.Pending, DemoPaymentMethod.Card, DemoDeliveryMethod.Home);
      const value = ensureFulfillment(order);
      if (reject) cart.resolvePayment('customer', order.id, DemoScenario.Rejected); else cart.cancelPayment('customer', order.id);
      expect(value.phase).toBe(Phase.Pending); expect(new DemoFulfillmentPolicy().actions(order)).toEqual([]);
      expect(() => new DemoFulfillmentPolicy().configure(order, value)).toThrow();
    }
    const { product, cart } = checkoutFixture(); cart.add('customer', product.sku, 1, product.variants[0].id);
    const order = cart.checkout('customer', 'unknown-payment', 'home', DemoScenario.Pending, DemoPaymentMethod.Card, DemoDeliveryMethod.Home);
    const value = ensureFulfillment(order); value.phase = Phase.Unknown;
    cart.resolvePayment('customer', order.id, DemoScenario.Approved);
    expect(ensureFulfillment(order).phase).toBe(Phase.Unknown); expect(new DemoFulfillmentPolicy().actions(order)).toEqual([]);
  });
  it('uses the frozen modular pickup destination throughout fulfillment and ignores later catalog edits', () => {
    const { product, cart } = checkoutFixture(); const destination = 'Sucursal Norte · Calle 456';
    product.variants[0].pickupLocation = destination; cart.add('customer', product.sku, 1, product.variants[0].id);
    const order = cart.checkout('customer', 'frozen-pickup', '', DemoScenario.Approved, DemoPaymentMethod.Card, DemoDeliveryMethod.Pickup);
    product.variants[0].pickupLocation = 'Sucursal Sur · Calle 999';
    const value = ensureFulfillment(order); expect(value.store).toBe(destination); expect(value.location).toBe(destination); expect(value.hours).toBe('');
    const policy = new DemoFulfillmentPolicy(); policy.apply(order, Action.Ready, ''); policy.apply(order, Action.Collect, '');
    const persisted: DemoFulfillmentOrder = order; persisted.fulfillment = JSON.parse(JSON.stringify(value)); decodeFulfillment(persisted);
    expect(ensureFulfillment(order).store).toBe(destination); expect(ensureFulfillment(order).location).toBe(destination);
    expect(order.delivery!.destination).toBe(destination); expect(order.address).toBe(destination);
  });
  it.each(['phase', 'incident', 'lastAction'] as const)('blocks every fulfillment write after decoding an unknown %s without mutation', field => {
    for (const reporting of [true, false]) {
      const { commerce, order } = create(DemoDeliveryMethod.Home);
      if (!reporting) commerce.reportIncident(order.id, 'Consulta abierta');
      const wire = JSON.parse(JSON.stringify(commerce.snapshot));
      wire.orders.find((value: { id: string }) => value.id === order.id).fulfillment[field] = { wire: 'future-state' };
      const restored = decodeSnapshot(JSON.stringify(wire)); const commands = new DemoCommerce(restored);
      const current = restored.orders.find(value => value.id === order.id)!; const policy = new DemoFulfillmentPolicy(); const before = JSON.stringify(restored);
      expect(policy.actions(current)).toEqual([]); expect(policy.canConfigure(current)).toBe(false);
      expect(() => commands.configureFulfillment(current.id, { ...ensureFulfillment(current), carrier: 'Changed' })).toThrow('conciliación');
      expect(() => commands.fulfill(current.id, Action.Dispatch)).toThrow('conciliación');
      expect(() => commands.reportIncident(current.id, 'Nueva consulta')).toThrow('conciliación');
      if (!reporting) expect(() => commands.resolveIncident(current.id, 'Respuesta')).toThrow('conciliación');
      expect(JSON.stringify(restored)).toBe(before);
    }
  });
  it('delivers only through a home policy with recoverable attempt and no impossible transition', () => {
    const { commerce, order } = create(DemoDeliveryMethod.Home); const stock = commerce.available('DEMO-001');
    expect(() => commerce.fulfill(order.id, Action.Collect)).toThrow(); commerce.fulfill(order.id, Action.Dispatch); expect(order.tracking).toContain(order.id);
    expect(() => commerce.fulfill(order.id, Action.FailedAttempt)).toThrow('motivo'); commerce.fulfill(order.id, Action.FailedAttempt, 'No había receptor'); expect(order.shipment).toBe(ShipmentStatus.Shipped); expect(ensureFulfillment(order).attempts).toBe(1);
    expect(() => commerce.fulfill(order.id, Action.Deliver)).toThrow(); expect(() => commerce.resolveIncident(order.id, '')).toThrow('nuevo intento'); commerce.fulfill(order.id, Action.Retry, 'Visita mañana de 9 a 12'); commerce.fulfill(order.id, Action.Deliver);
    expect(ensureFulfillment(order).phase).toBe(Phase.Delivered); expect(ensureFulfillment(order).attempts).toBe(2); expect(commerce.available('DEMO-001')).toBe(stock); const history = order.history.length; commerce.fulfill(order.id, Action.Deliver); expect(order.history).toHaveLength(history);
    const restored = decodeSnapshot(JSON.stringify(commerce.snapshot)); expect(ensureFulfillment(restored.orders.at(-1)!).phase).toBe(Phase.Delivered);
  });
  it('pickup never dispatches a carrier and records no-show plus extension before collection', () => {
    const { commerce, order } = create(DemoDeliveryMethod.Pickup); const policy = new DemoFulfillmentPolicy();
    const draft = { ...ensureFulfillment(order), store: 'Sucursal Norte', location: 'Calle 123', hours: '9 a 17', pickupDeadline: '2026-12-31' }; commerce.configureFulfillment(order.id, draft);
    expect(policy.actions(order)).toEqual([Action.Ready]); commerce.fulfill(order.id, Action.Ready); commerce.fulfill(order.id, Action.NoShow, 'No retiró al vencer el plazo'); expect(ensureFulfillment(order).phase).toBe(Phase.Ready); expect(order.tracking).toBe('');
    expect(() => commerce.fulfill(order.id, Action.Collect)).toThrow(); commerce.fulfill(order.id, Action.Extend, 'Retiro coordinado el viernes', '2027-01-07'); commerce.fulfill(order.id, Action.Collect); expect(order.shipment).toBe(ShipmentStatus.Delivered); expect(ensureFulfillment(order).phase).toBe(Phase.Collected); expect(ensureFulfillment(order).attempts).toBe(0);
    expect(() => commerce.configureFulfillment(order.id, draft)).toThrow();
  });
  it('reports customer issue without replacing delivery and blocks advance until answered', () => {
    const { commerce, order } = create(DemoDeliveryMethod.Home); commerce.reportIncident(order.id, 'Actualizar contacto'); expect(ensureFulfillment(order).incident).toBe(Incident.Report); expect(new DemoFulfillmentPolicy().actions(order)).toEqual([]); commerce.resolveIncident(order.id, 'Contacto confirmado'); commerce.advance(order.id); expect(order.shipment).toBe(ShipmentStatus.Shipped);
  });
  it('requires a written answer and keeps unresolved incidents actionable for both contexts', () => {
    const { commerce, order } = create(DemoDeliveryMethod.Home); const inbox = new DemoInboxPolicy();
    commerce.reportIncident(order.id, 'Actualizar contacto');
    expect(() => commerce.resolveIncident(order.id, '   ')).toThrow('respuesta');
    expect(ensureFulfillment(order).incident).toBe(Incident.Report);
    inbox.reconcile(commerce.snapshot, 'first');
    const admin = commerce.snapshot.inbox!.alerts.find(value => value.id === `admin:incident:${order.id}`)!;
    const buyer = commerce.snapshot.inbox!.alerts.find(value => value.id === `customer:cliente:incident:${order.id}`)!;
    expect(admin.resolution).toBe(Resolution.Active); expect(buyer.resolution).toBe(Resolution.Active); expect(admin.orderId).toBe(order.id);
    inbox.mark(commerce.snapshot, 'admin', admin.id, Read.Read);
    commerce.resolveIncident(order.id, 'Contacto actualizado'); inbox.reconcile(commerce.snapshot, 'resolved');
    expect(admin.resolution).toBe(Resolution.Resolved); expect(buyer.resolution).toBe(Resolution.Resolved);
    commerce.reportIncident(order.id, 'Nueva consulta'); inbox.reconcile(commerce.snapshot, 'second');
    expect(admin.read).toBe(Read.Unread); expect(admin.resolution).toBe(Resolution.Active); expect(admin.text).toContain('Nueva consulta');
    expect(order.history).toEqual(expect.arrayContaining([expect.stringContaining('Actualizar contacto'), expect.stringContaining('Contacto actualizado')]));
  });
  it('refreshes variant stock alerts for changed quantities and a new low-stock episode without repeated reopening', () => {
    const base = checkoutFixture(); const snapshot: DemoInboxSnapshot = { ...base.snapshot, version: 4, settings: { lowStockThreshold: 5 }, competitors: [] }; const inbox = new DemoInboxPolicy(); const product = base.product; const variant = product.variants[0];
    const setVariantOnHand = (onHand: number) => { product.onHand += onHand - variant.onHand; variant.onHand = onHand; };
    setVariantOnHand(variant.reserved + 2); inbox.reconcile(snapshot, 'first');
    const alert = snapshot.inbox!.alerts.find(value => value.id === `admin:stock:${product.sku}:${variant.id}`)!;
    inbox.mark(snapshot, 'admin', alert.id, Read.Read); inbox.reconcile(snapshot, 'same');
    expect(alert.read).toBe(Read.Read); expect(alert.created).toBe('first');
    setVariantOnHand(variant.reserved + 1); inbox.reconcile(snapshot, 'changed');
    expect(alert.text).toContain('1 disponibles'); expect(alert.read).toBe(Read.Unread);
    inbox.mark(snapshot, 'admin', alert.id, Read.Read);
    setVariantOnHand(variant.reserved + snapshot.settings.lowStockThreshold); inbox.reconcile(snapshot, 'healthy');
    expect(alert.resolution).toBe(Resolution.Resolved); expect(alert.text).toContain(`${snapshot.settings.lowStockThreshold} disponibles`);
    setVariantOnHand(variant.reserved + 2); inbox.reconcile(snapshot, 'new-episode');
    expect(alert.resolution).toBe(Resolution.Active); expect(alert.read).toBe(Read.Unread); expect(alert.text).toContain('2 disponibles'); expect(alert.created).toBe('new-episode');
    const restored: DemoInboxSnapshot = JSON.parse(JSON.stringify(snapshot)); restored.products = [DemoCatalogWire.product(restored.products[0])]; decodeInbox(restored); expect(restored.inbox!.alerts.find(value => value.id === alert.id)!.read).toBe(Read.Unread);
    variant.saleState = VariantSaleState.Disabled; inbox.reconcile(snapshot, 'archived'); expect(alert.resolution).toBe(Resolution.Resolved);
  });
  it('keeps modular checkout delivery eligible for the current post-sale commands and reconciles their actor alerts', () => {
    const { snapshot, order, commands } = postSaleFixture();
    const policy = new DemoFulfillmentPolicy();
    expect(ensureFulfillment(order).phase).toBe(Phase.Delivered);
    const request = commands.request('customer', 'delivery-return', order.id, [{ sku: order.lines[0].sku, variantId: order.lines[0].variantId, quantity: 1, reason: DemoReturnReason.Damaged }]);
    const state: DemoInboxSnapshot = { ...snapshot, version: 4, settings: { lowStockThreshold: 5 }, competitors: [] };
    const inbox = new DemoInboxPolicy(); inbox.reconcile(state, 'now');
    expect(policy.actions(order)).toEqual([]);
    expect(inbox.visible(state, 'customer:customer').some(alert => alert.category === Category.PostSale && alert.orderId === request.orderId)).toBe(true);
    expect(inbox.visible(state, 'customer:another')).toEqual([]);
    const count = state.inbox!.alerts.length; inbox.reconcile(state, 'later'); expect(state.inbox!.alerts).toHaveLength(count);
  });
  it('unknown values close commands and legacy snapshot migrates without losing completed post-sale eligibility', () => {
    expect(Phase.fromWire('invented')).toBe(Phase.Unknown); expect(Action.fromWire('invented')).toBe(Action.Unknown); expect(Incident.fromWire('invented')).toBe(Incident.Unknown);
    const snapshot = demoSeed(); const restored = decodeSnapshot(JSON.stringify(snapshot)); expect(restored.version).toBe(4); expect(ensureFulfillment(restored.orders[2]).phase).toBe(Phase.Delivered);
    restored.orders[0].fulfillment!.phase = Phase.Unknown; expect(new DemoFulfillmentPolicy().actions(restored.orders[0])).toEqual([]);
    restored.orders[0].fulfillment!.phase = Phase.Collected; expect(() => decodeSnapshot(JSON.stringify(restored))).toThrow('modalidad');
  });
  it('deduplicates history, persists read state and isolates buyers and administrator', () => {
    const snapshot = demoSeed(); const inbox = new DemoInboxPolicy(); inbox.reconcile(snapshot, '2026-10-09'); const count = snapshot.inbox!.alerts.length; inbox.reconcile(snapshot, '2026-10-10'); expect(snapshot.inbox!.alerts).toHaveLength(count);
    const customer = inbox.audience(false, 'cliente'); const second = inbox.audience(false, 'cliente2'); const own = inbox.visible(snapshot, customer)[0]; expect(inbox.visible(snapshot, customer).every(value => value.orderId !== 'DEMO-102')).toBe(true);
    expect(() => inbox.mark(snapshot, second, own.id, Read.Read)).toThrow('contexto'); inbox.mark(snapshot, customer, own.id, Read.Read); expect(inbox.visible(snapshot, 'admin').every(value => value.read === Read.Unread)).toBe(true);
    const restored = decodeSnapshot(JSON.stringify(snapshot)); expect(inbox.visible(restored, customer).find(value => value.id === own.id)!.read).toBe(Read.Read); expect(Read.fromWire('invented')).toBe(Read.Unknown); expect(Category.fromWire('invented')).toBe(Category.Unknown); expect(DemoAlertFilter.fromWire('invented')).toBe(DemoAlertFilter.Unknown);
  });
  it('preferences pause new events while preserving history and resumes deterministically', () => {
    const snapshot = demoSeed(); const inbox = new DemoInboxPolicy(); inbox.reconcile(snapshot, 'today'); const audience = inbox.audience(false, 'cliente'); const before = inbox.visible(snapshot, audience).length;
    inbox.preference(snapshot, audience, Category.Orders, false); snapshot.orders[0].history.push('Nueva coordinación'); inbox.reconcile(snapshot, 'later'); expect(inbox.visible(snapshot, audience)).toHaveLength(before); expect(inbox.visible(snapshot, 'admin')).toHaveLength(snapshot.inbox!.alerts.filter(value => value.audience === 'admin').length);
    inbox.preference(snapshot, audience, Category.Orders, true); inbox.reconcile(snapshot, 'later'); expect(inbox.visible(snapshot, audience)).toHaveLength(before + 1);
    snapshot.inbox!.alerts[0].audience = audience; snapshot.inbox!.alerts[0].orderId = 'DEMO-102'; expect(() => decodeSnapshot(JSON.stringify(snapshot))).toThrow('Destino');
  });
});
