import { CustomerOrderReadCommand, CustomerOrderReadMode, CustomerOrderRefreshPhase } from './customer-order-refresh';

describe('customer order refresh closed types', () => {
  it('translates known wires once and fails closed for unknown values', () => {
    expect(CustomerOrderRefreshPhase.fromWire('REFRESHING')).toBe(CustomerOrderRefreshPhase.Refreshing);
    expect(CustomerOrderRefreshPhase.fromWire('FUTURE')).toBe(CustomerOrderRefreshPhase.Unknown);
    expect(CustomerOrderReadMode.fromWire('REFRESH')).toBe(CustomerOrderReadMode.Refresh);
    expect(CustomerOrderReadMode.fromWire(null)).toBe(CustomerOrderReadMode.Unknown);
  });

  it('creates explicit initial and refresh commands', () => {
    expect(CustomerOrderReadCommand.initial('A')).toMatchObject({ orderId: 'A', mode: CustomerOrderReadMode.Initial });
    expect(CustomerOrderReadCommand.refresh('B')).toMatchObject({ orderId: 'B', mode: CustomerOrderReadMode.Refresh });
  });
});
