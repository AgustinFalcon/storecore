import { DemoRecoveryPhase as Phase } from './demo-recovery-phase';

describe('SC03 closed phases', () => {
  it('translates every supported phase and never renders an arbitrary wire', () => {
    for (const phase of Phase.all) { expect(Phase.fromWire(phase.wire)).toBe(phase); expect(phase.label).toBeTruthy(); expect(phase.description).toBeTruthy(); }
    for (const raw of ['invented', 'COMPLETED', null, {}, '']) expect(Phase.fromWire(raw)).toBe(Phase.Unknown);
    expect(Phase.Unknown.label).not.toContain('invented');
    expect(Phase.Submitting.canRequest).toBe(false);
    expect(Phase.ServiceError.canRequest).toBe(true);
  });
});
