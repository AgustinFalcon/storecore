import { CapabilityCommandStatus } from './capability-command-status';

describe('CapabilityCommandStatus', () => {
  it('translates only exact known results and never exposes an arbitrary result', () => {
    expect(CapabilityCommandStatus.fromWire('COMPLETED')).toBe(CapabilityCommandStatus.Completed);
    for (const raw of [' completed ', 'OTHER', ['COMPLETED'], null, undefined]) {
      expect(CapabilityCommandStatus.fromWire(raw)).toBe(CapabilityCommandStatus.Unknown);
    }
  });
});
