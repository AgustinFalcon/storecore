import { RmaStatus, RmaTransition } from './rma-status';

describe('RmaStatus', () => {
  it('owns the next one-step transition', () => {
    expect(RmaStatus.fromOptionalWire(null)).toBeNull();
    expect(RmaStatus.fromOptionalWire('')).toBeNull();
    expect(RmaStatus.fromWire('RETURN_RECEIVED').next).toBe(RmaTransition.Inspected);
    expect(RmaStatus.fromWire('INSPECTED').next).toBe(RmaTransition.Adjusted);
    expect(RmaStatus.fromWire('CLOSED').next).toBeNull();
  });

  it('does not treat an unknown wire as a valid RMA state', () => {
    const status = RmaStatus.fromWire('RESTOCKED');
    expect(status).toBe(RmaStatus.Unknown);
    expect(status.label).toBe('Estado de RMA no reconocido');
  });
});
