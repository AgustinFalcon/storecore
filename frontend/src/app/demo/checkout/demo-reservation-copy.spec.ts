import { DemoDeliveryMethod } from '../demo-process-types';
import { DemoScenario } from '../demo-model';
import { DemoReservationState } from './demo-reservation-state';
import { checkoutFixture } from './checkout-test-fixture';
import { DemoOrderReservations } from './demo-order-reservations';
import type { DemoCartCommandPort } from './demo-cart-commands';

describe('payment reservation evidence', () => {
  const pending = (overrides: Partial<DemoCartCommandPort> = {}) => {
    const fixture = checkoutFixture(overrides);
    fixture.cart.add('customer', fixture.product.sku, 2, fixture.product.variants[0].id);
    const order = fixture.cart.checkout('customer', 'pending', 'home', DemoScenario.Pending, undefined, DemoDeliveryMethod.Home);
    return { ...fixture, order };
  };
  it('rejects another customer or an absent actor before touching balances or payment state', () => {
    const { cart, snapshot, order } = pending();
    snapshot.actors.push({ id: 'other-customer', addresses: [], cart: [] });
    const before = JSON.stringify(snapshot);
    const settlement = vi.spyOn(DemoOrderReservations, 'settle');
    try {
      for (const id of ['other-customer', 'absent', undefined as unknown as string]) {
        expect(() => cart.resolvePayment(id, order.id, DemoScenario.Approved)).toThrow();
        expect(() => cart.cancelPayment(id, order.id)).toThrow();
        expect(JSON.stringify(snapshot)).toBe(before);
      }
      expect(settlement).not.toHaveBeenCalled();
    } finally { settlement.mockRestore(); }
  });
  it('requires the current authorization even for the owner and idempotent cancellation', () => {
    let activeSession = false;
    const authorization = vi.fn((actorId: string) => { if (!activeSession || actorId !== 'customer') throw new Error('Sesión inválida.'); });
    const { cart, snapshot, order } = pending({ requirePaymentAccess: authorization });
    const before = JSON.stringify(snapshot);
    expect(() => cart.resolvePayment('customer', order.id, DemoScenario.Approved)).toThrow('Sesión');
    expect(() => cart.cancelPayment('customer', order.id)).toThrow('Sesión');
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(authorization).toHaveBeenCalledWith('customer', order);
    activeSession = true;
    cart.cancelPayment('customer', order.id);
    const cancelled = JSON.stringify(snapshot);
    activeSession = false;
    expect(() => cart.cancelPayment('customer', order.id)).toThrow('Sesión');
    expect(JSON.stringify(snapshot)).toBe(cancelled);
  });
  it('releases only owned stock once and describes that evidence', () => {
    const { cart, product, order } = pending();
    product.variants[0].reserved++;
    cart.cancelPayment('customer', order.id);
    expect(product.variants[0].reserved).toBe(1);
    expect(order.reservation!.state).toBe(DemoReservationState.Released);
    expect(order.history.at(-1)).toContain(DemoReservationState.Held.cancelSuccess);
    cart.cancelPayment('customer', order.id);
    expect(product.variants[0].reserved).toBe(1);
  });
  it('blocks unknown and duplicate reservation evidence before any mutation', () => {
    const { cart, snapshot, order } = pending();
    delete order.reservation;
    let before = JSON.stringify(snapshot);
    expect(() => cart.cancelPayment('customer', order.id)).toThrow('reserva propia');
    expect(JSON.stringify(snapshot)).toBe(before);
    order.reservation = { state: DemoReservationState.Held, lines: [order.lines[0], order.lines[0]] };
    order.lines.push({ ...order.lines[0] });
    before = JSON.stringify(snapshot);
    expect(() => DemoOrderReservations.settle(order, snapshot, false)).toThrow('no coincide');
    expect(JSON.stringify(snapshot)).toBe(before);
  });
  it('consumes owned reservations on approval and never claims release without evidence', () => {
    const { cart, product, order } = pending();
    cart.resolvePayment('customer', order.id, DemoScenario.Approved);
    expect([product.variants[0].onHand, product.variants[0].reserved]).toEqual([8, 0]);
    expect(order.reservation!.state).toBe(DemoReservationState.Consumed);
    for (const copy of [DemoReservationState.None.pendingGuidance, DemoReservationState.None.cancelSuccess]) expect(copy).not.toMatch(/reserva/i);
    expect(DemoReservationState.fromWire('invented')).toBe(DemoReservationState.Unknown);
    expect(DemoReservationState.Unknown.canCancelPending).toBe(false);
    for (const state of DemoReservationState.all) expect(DemoReservationState.fromWire(state.wire)).toBe(state);
  });
});
