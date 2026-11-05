import { HomeContentPhase } from './home-content-phase';

describe('HomeContentPhase boundary', () => {
  it('translates every supported phase and fails closed for unknown wire data', () => {
    for (const phase of HomeContentPhase.all) expect(HomeContentPhase.fromWire(phase.wire)).toBe(phase);
    for (const raw of ['published-by-client', null, {}, 1]) expect(HomeContentPhase.fromWire(raw)).toBe(HomeContentPhase.Unknown);
    expect(HomeContentPhase.Loading.busy).toBe(true);
    expect(HomeContentPhase.Saving.busy).toBe(true);
    expect(HomeContentPhase.Unknown.busy).toBe(false);
  });
});
