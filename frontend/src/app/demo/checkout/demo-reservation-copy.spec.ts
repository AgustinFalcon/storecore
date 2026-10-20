import { DemoScenario } from '../demo-model';
import { DemoReservationState } from './demo-reservation-state';
import { checkoutFixture } from './checkout-test-fixture';
import { DemoOrderReservations } from './demo-order-reservations';

describe('payment reservation evidence', () => {
  const pending = () => {
    const fixture = checkoutFixture();
    fixture.cart.add('customer', fixture.product.sku, 2, fixture.product.variants[0].id);
    const order = fixture.cart.checkout('customer', 'pending', 'home', DemoScenario.Pending);
    return { ...fixture, order };
  };
  it('releases only owned stock once and describes that evidence', () => {
    const { cart, product, order } = pending();
    product.variants[0].reserved++;
    cart.cancelPayment(order.id);
    expect(product.variants[0].reserved).toBe(1);
    expect(order.reservation!.state).toBe(DemoReservationState.Released);
    expect(order.history.at(-1)).toContain(DemoReservationState.Held.cancelSuccess);
    cart.cancelPayment(order.id);
    expect(product.variants[0].reserved).toBe(1);
  });
  it('blocks unknown and duplicate reservation evidence before any mutation', () => {
    const { cart, snapshot, order } = pending();
    delete order.reservation;
    let before = JSON.stringify(snapshot);
    expect(() => cart.cancelPayment(order.id)).toThrow('reserva propia');
    expect(JSON.stringify(snapshot)).toBe(before);
    order.reservation = { state: DemoReservationState.Held, lines: [order.lines[0], order.lines[0]] };
    order.lines.push({ ...order.lines[0] });
    before = JSON.stringify(snapshot);
    expect(() => DemoOrderReservations.settle(order, snapshot, false)).toThrow('no coincide');
    expect(JSON.stringify(snapshot)).toBe(before);
  });
  it('consumes owned reservations on approval and never claims release without evidence', () => {
    const { cart, product, order } = pending();
    cart.resolvePayment(order.id, DemoScenario.Approved);
    expect([product.variants[0].onHand, product.variants[0].reserved]).toEqual([8, 0]);
    expect(order.reservation!.state).toBe(DemoReservationState.Consumed);
    for (const copy of [DemoReservationState.None.pendingGuidance, DemoReservationState.None.cancelSuccess]) expect(copy).not.toMatch(/reserva/i);
    expect(DemoReservationState.fromWire('invented')).toBe(DemoReservationState.Unknown);
    expect(DemoReservationState.Unknown.canCancelPending).toBe(false);
    for (const state of DemoReservationState.all) expect(DemoReservationState.fromWire(state.wire)).toBe(state);
  });
});
