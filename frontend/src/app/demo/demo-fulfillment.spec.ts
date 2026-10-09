import { DemoCommerce, DemoScenario, decodeSnapshot, demoSeed } from './demo-model';
import { DemoDeliveryMethod, DemoPaymentMethod } from './demo-process-types';
import { DemoFulfillmentAction as Action, DemoFulfillmentPhase as Phase, DemoFulfillmentPolicy, DemoIncidentKind as Incident, ensureFulfillment } from './demo-fulfillment';
import { ShipmentStatus } from '../domain/order/shipment-status';
import { DemoAlertCategory as Category, DemoAlertRead as Read, DemoAlertResolution as Resolution, DemoAlertFilter, DemoInboxPolicy } from './demo-inbox';

describe('fulfillment by modality and persistent notification ownership', () => {
  const create = (method: DemoDeliveryMethod) => { const commerce = new DemoCommerce(demoSeed()); commerce.add('cliente', 'DEMO-001', 1); return { commerce, order: commerce.checkout('cliente', 'fulfillment', 'address-cliente', DemoScenario.Approved, DemoPaymentMethod.Card, method) }; };
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
    const snapshot = demoSeed(); const inbox = new DemoInboxPolicy(); const product = snapshot.products[0]; const variant = product.variants![0];
    const setVariantOnHand = (onHand: number) => { product.onHand += onHand - variant.onHand; variant.onHand = onHand; };
    setVariantOnHand(variant.reserved + 2); inbox.reconcile(snapshot, 'first');
    const alert = snapshot.inbox!.alerts.find(value => value.id === `admin:stock:${variant.id}`)!;
    inbox.mark(snapshot, 'admin', alert.id, Read.Read); inbox.reconcile(snapshot, 'same');
    expect(alert.read).toBe(Read.Read); expect(alert.created).toBe('first');
    setVariantOnHand(variant.reserved + 1); inbox.reconcile(snapshot, 'changed');
    expect(alert.text).toContain('1 disponibles'); expect(alert.read).toBe(Read.Unread);
    inbox.mark(snapshot, 'admin', alert.id, Read.Read);
    setVariantOnHand(variant.reserved + snapshot.settings.lowStockThreshold); inbox.reconcile(snapshot, 'healthy');
    expect(alert.resolution).toBe(Resolution.Resolved); expect(alert.text).toContain(`${snapshot.settings.lowStockThreshold} disponibles`);
    setVariantOnHand(variant.reserved + 2); inbox.reconcile(snapshot, 'new-episode');
    expect(alert.resolution).toBe(Resolution.Active); expect(alert.read).toBe(Read.Unread); expect(alert.text).toContain('2 disponibles'); expect(alert.created).toBe('new-episode');
    const restored = decodeSnapshot(JSON.stringify(snapshot)); expect(restored.inbox!.alerts.find(value => value.id === alert.id)!.read).toBe(Read.Unread);
    variant.active = false; inbox.reconcile(snapshot, 'archived'); expect(alert.resolution).toBe(Resolution.Resolved);
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
