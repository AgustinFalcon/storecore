import { DemoDeliveryQuote as Quote, DemoDeliveryAcceptance as Acceptance, DeliveryConfirmation as Confirmation } from './demo-delivery-quote';
import { DemoDeliveryMethod as Method, DemoPaymentMethod } from '../demo-process-types';
import { DemoCommerce, DemoScenario, DemoProductVariant, demoSeed } from '../demo-model';

describe('SC11A shared delivery facts', () => {
  const address = { id: 'home', label: 'Casa', street: 'Calle 1', city: 'CABA', postal: '1000', primary: true };
  it('builds exact Home and Pickup snapshots and rejects invalid facts', () => {
    expect(Quote.create(Method.Home, address, 7).snapshot()).toEqual({ method: Method.Home, destination: 'Calle 1 · CABA · CP 1000', cost: Method.Home.cost, days: 7 });
    expect(Quote.create(Method.Pickup, undefined, NaN).snapshot()).toEqual({ method: Method.Pickup, destination: 'Comercio de muestra · Retiro con DNI y número de pedido', cost: 0, days: Method.Pickup.days });
    expect(Quote.create(Method.Unknown, address, 5)).toBe(Quote.Unknown); expect(Quote.create(Method.Home, undefined, 5)).toBe(Quote.Unknown);
    for (const days of [0, -1, NaN, 1.5]) expect(Quote.create(Method.Home, address, days)).toBe(Quote.Unknown);
    expect(() => Quote.Unknown.snapshot()).toThrow();
  });
  it('binds closed confirmation to exact delivery/cart facts and explicit reset', () => {
    for (const state of Confirmation.all) expect(Confirmation.fromWire(state.wire)).toBe(state);
    expect(Confirmation.fromWire('invented')).toBe(Confirmation.Unknown);
    const acceptance = new Acceptance(); const quote = Quote.create(Method.Home, address, 5);
    expect(acceptance.state(quote, 'cart')).toBe(Confirmation.Pending);
    acceptance.confirm(quote, 'cart'); expect(acceptance.state(quote, 'cart')).toBe(Confirmation.Confirmed);
    for (const changed of [Quote.Unknown, Quote.create(Method.Home, { ...address, id: 'other' }, 5), Quote.create(Method.Home, { ...address, street: 'Other' }, 5), Quote.create(Method.Home, address, 6), Quote.create(Method.Pickup, undefined, 5)]) expect(acceptance.state(changed, 'cart')).toBe(Confirmation.Pending);
    expect(acceptance.state(quote, 'changed-variant-quantity-price')).toBe(Confirmation.Pending);
    acceptance.reset(); expect(acceptance.state(quote, 'cart')).toBe(Confirmation.Pending);
    acceptance.confirm(Quote.Unknown, 'cart'); expect(acceptance.state(Quote.Unknown, 'cart')).toBe(Confirmation.Pending);
  });
  it.each(Method.all)('uses the same visible quote in the order: %s', method => {
    const commerce = new DemoCommerce(demoSeed()); const actor = commerce.actor('cliente'); commerce.add(actor.id, 'DEMO-001', 2, DemoProductVariant.Case);
    const quote = Quote.create(method, actor.addresses[0], commerce.snapshot.settings.deliveryDays);
    const order = commerce.checkout(actor.id, 'SC11A', actor.addresses[0].id, DemoScenario.Approved, DemoPaymentMethod.Card, method);
    expect(order.delivery).toEqual(quote.snapshot()); expect(order.address).toBe(quote.destination);
    expect(order.total).toBe(order.lines.reduce((total, line) => total + line.unit * line.quantity, 0) + quote.cost);
  });
});
