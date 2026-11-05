import { DemoCheckoutResultPresenter, DemoResultOutcome as Outcome, PresentResultStep } from './demo-checkout-result';
import { DemoPaymentShipmentPolicy as Policy } from './demo-payment-shipment-policy';
import { DemoCommerce, DemoContext, DemoScenario, demoSeed } from '../demo-model';
import { DemoDeliveryMethod, DemoPaymentMethod } from '../demo-process-types';
import { OrderStatus, PaymentStatus, ShipmentStatus } from '../../domain/order/commerce-states';

describe('SC12A closed authoritative result', () => {
  const presenter = new DemoCheckoutResultPresenter();
  function create(scenario = DemoScenario.Approved) { const commerce = new DemoCommerce(demoSeed()); commerce.add('cliente', 'DEMO-001', 2); const order = commerce.checkout('cliente', 'result-test', 'address-cliente', scenario, DemoPaymentMethod.Card, DemoDeliveryMethod.Home); return { commerce, order }; }
  it('translates every closed outcome and shipment decision without raw status labels', () => {
    for (const outcome of Outcome.all) expect(Outcome.fromWire(outcome.wire)).toBe(outcome);
    for (const raw of [null, {}, 'arbitrary', 'unknown']) expect(Outcome.fromWire(raw)).toBe(Outcome.Unknown);
    for (const entry of [{ payment: PaymentStatus.Approved, shipment: ShipmentStatus.Preparing }, { payment: PaymentStatus.Pending, shipment: ShipmentStatus.Pending }, { payment: PaymentStatus.Rejected, shipment: ShipmentStatus.Cancelled }, { payment: PaymentStatus.Cancelled, shipment: ShipmentStatus.Cancelled }, { payment: PaymentStatus.Refunded, shipment: ShipmentStatus.Unknown }, { payment: PaymentStatus.ChargedBack, shipment: ShipmentStatus.Unknown }, { payment: PaymentStatus.Unknown, shipment: ShipmentStatus.Unknown }]) expect(Policy.forPayment(entry.payment)).toBe(entry.shipment);
  });
  it('new checkout and explicit pending decisions use coherent shipment without changing stock policy', () => {
    for (const entry of [{ scenario: DemoScenario.Approved, outcome: Outcome.Approved }, { scenario: DemoScenario.Pending, outcome: Outcome.Pending }, { scenario: DemoScenario.Rejected, outcome: Outcome.Rejected }]) {
      const { commerce, order } = create(entry.scenario); expect(presenter.execute(commerce.snapshot.orders, order.id, DemoContext.Customer, 'cliente').outcome).toBe(entry.outcome);
      expect(order.shipment).toBe(Policy.forPayment(order.payment));
    }
    const approved = create(DemoScenario.Pending); approved.commerce.resolvePayment(approved.order.id, DemoScenario.Approved); expect(approved.order.shipment).toBe(ShipmentStatus.Preparing);
    const rejected = create(DemoScenario.Pending); rejected.commerce.resolvePayment(rejected.order.id, DemoScenario.Rejected); expect(rejected.order.shipment).toBe(ShipmentStatus.Cancelled);
    const cancelled = create(DemoScenario.Pending); cancelled.commerce.cancelPayment(cancelled.order.id); const snapshot = JSON.stringify(cancelled.commerce.snapshot); cancelled.commerce.cancelPayment(cancelled.order.id); expect(JSON.stringify(cancelled.commerce.snapshot)).toBe(snapshot); expect(cancelled.order.shipment).toBe(ShipmentStatus.Cancelled);
  });
  it('foreign, missing and privileged contexts do not reveal an order', () => {
    const { commerce, order } = create();
    for (const context of [DemoContext.Admin, DemoContext.Unknown]) expect(presenter.execute(commerce.snapshot.orders, order.id, context, 'cliente').order).toBeNull();
    expect(presenter.execute(commerce.snapshot.orders, order.id, DemoContext.Customer, 'cliente2')).toEqual(presenter.execute(commerce.snapshot.orders, 'missing', DemoContext.Customer, 'cliente'));
  });
  it('legacy inconsistencies are projected as review without rewriting persisted facts', () => {
    const { commerce, order } = create(DemoScenario.Pending); order.shipment = ShipmentStatus.Preparing; const before = JSON.stringify(commerce.snapshot);
    expect(presenter.execute(commerce.snapshot.orders, order.id, DemoContext.Customer, 'cliente').outcome).toBe(Outcome.Review); expect(JSON.stringify(commerce.snapshot)).toBe(before);
  });
  it('legacy shipping remains unknown and an impossible negative difference never becomes approved', () => {
    const { order } = create(); delete order.delivery; order.lines = [{ sku: 'DEMO-001', name: 'Historic', quantity: 2, unit: 100 }]; order.total = 100;
    expect(new PresentResultStep().execute(order).outcome).toBe(Outcome.Review);
    order.total = 250; const view = new PresentResultStep().execute(order); expect(view.outcome).toBe(Outcome.Approved); expect(view.shippingKnown).toBe(false); expect(view.merchandise).toBe(200);
  });
  it('unknown/reversal/inconsistent facts cannot present payment or postal finality', () => {
    const { order } = create(); order.shipment = ShipmentStatus.Shipped; order.tracking = 'SIM-test';
    expect(new PresentResultStep().execute(order).postalTracking).toBe(true);
    order.status = OrderStatus.PaidStockReview; expect(new PresentResultStep().execute(order).outcome).toBe(Outcome.Review); expect(new PresentResultStep().execute(order).postalTracking).toBe(false);
    order.status = OrderStatus.Paid; order.payment = PaymentStatus.Unknown; expect(new PresentResultStep().execute(order).outcome).toBe(Outcome.Unknown);
    for (const payment of [PaymentStatus.Refunded, PaymentStatus.ChargedBack]) { order.payment = payment; expect(new PresentResultStep().execute(order).outcome).toBe(Outcome.Review); expect(new PresentResultStep().execute(order).postalTracking).toBe(false); }
    order.payment = PaymentStatus.Approved; order.delivery!.method = DemoDeliveryMethod.Pickup; expect(new PresentResultStep().execute(order).postalTracking).toBe(false);
  });
  it('uses snapshot money and never current catalog repricing', () => {
    const { commerce, order } = create(); const before = presenter.execute(commerce.snapshot.orders, order.id, DemoContext.Customer, 'cliente'); commerce.product('DEMO-001').price *= 2;
    expect(presenter.execute(commerce.snapshot.orders, order.id, DemoContext.Customer, 'cliente')).toEqual(before);
    order.total++; expect(new PresentResultStep().execute(order).outcome).toBe(Outcome.Review);
  });
});
