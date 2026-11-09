import { CustomerAccountState, CustomerStateTransition } from './customer-admin';
describe('customer administration closed types', () => {
  it('fails closed for unknown states and transitions', () => {
    expect(CustomerAccountState.fromWire('LOCKED')).toBe(CustomerAccountState.Unknown);
    expect(CustomerStateTransition.fromWire('DELETE')).toBe(CustomerStateTransition.Unknown);
    expect(CustomerStateTransition.for(CustomerAccountState.Unknown)).toBe(CustomerStateTransition.Unknown);
  });
  it('owns the only valid state transitions', () => {
    expect(CustomerStateTransition.for(CustomerAccountState.Active)).toBe(CustomerStateTransition.Suspend);
    expect(CustomerStateTransition.for(CustomerAccountState.Suspended)).toBe(CustomerStateTransition.Reactivate);
  });
});
