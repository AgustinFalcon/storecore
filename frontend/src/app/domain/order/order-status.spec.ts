import { OrderStatus } from './order-status';

describe('OrderStatus', () => {
  it('translates known wires once', () => {
    expect(OrderStatus.fromWire('PENDING_PAYMENT')).toBe(OrderStatus.PendingPayment);
    expect(OrderStatus.fromWire('PAID').label).toBe('Pagada');
  });

  it('does not treat an unknown wire as a valid order state', () => {
    expect(OrderStatus.fromWire('FLAG_ON')).toBe(OrderStatus.Unknown);
    expect(OrderStatus.fromWire('FLAG_ON').label).toBe('Estado de orden no reconocido');
  });
});
