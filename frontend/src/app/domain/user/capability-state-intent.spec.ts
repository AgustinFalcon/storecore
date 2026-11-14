import { CapabilityModuleId as Module } from './capability-module-id';
import { CapabilityModuleState as State } from './capability-module-state';
import { CapabilityMutationPhase as Phase } from './capability-mutation-phase';
import { CapabilityTargetPolicy as Policy } from './capability-target-policy';
import { CapabilityStateIntent as Intent } from './capability-state-intent';
import { UserRole } from './user-role';

const row = { id: Module.Catalog, state: State.Disabled, configVersion: 4 };
const uuid = () => '10000000-0000-4000-8000-000000000001';
describe('Capability closed command domain', () => {
  it('encodes every published generic transition exactly once', () => {
    expect(State.Disabled.allowedTargets).toEqual([State.ReadOnly, State.Active]);
    expect(State.Error.allowedTargets).toEqual([State.Paused, State.Disabled]);
    for (const state of [State.ReadOnly, State.Active, State.Paused]) {
      expect(state.allowedTargets).toHaveLength(4);
      expect(state.allowedTargets).not.toContain(state);
      expect(state.allowedTargets).not.toContain(State.Unknown);
    }
    expect(State.Unknown.allowedTargets).toEqual([]);
  });
  it('translates all phases and productive policy fail closed', () => {
    for (const phase of [Phase.Idle, Phase.Editing, Phase.Saving, Phase.Confirmed, Phase.Conflict, Phase.ResultUncertain, Phase.Rejected]) expect(Phase.fromWire(phase.wire)).toBe(phase);
    expect(Phase.fromWire('future')).toBe(Phase.Unknown);
    expect(Policy.fromWire(Policy.Productive.wire)).toBe(Policy.Productive);
    expect(Policy.fromWire('future')).toBe(Policy.Unknown);
    expect(Policy.Productive.permits([UserRole.Operator])).toBe(true);
    expect(Policy.Productive.permitsMutation([UserRole.Operator])).toBe(false);
    expect(Policy.Productive.permitsMutation([UserRole.Admin])).toBe(true);
    expect(Policy.Unknown.permitsMutation([UserRole.Admin])).toBe(false);
  });
  it('creates one immutable trimmed intent with the supplied audit correlation', () => {
    const random = vi.fn(uuid); const intent = Intent.create(row, State.Active, '  mantenimiento  ', random)!;
    expect(random).toHaveBeenCalledTimes(1);
    expect(intent.reason).toBe('mantenimiento'); expect(intent.correlationId).toBe(uuid());
    expect(Object.isFrozen(intent)).toBe(true);
    expect(Intent.fromWire(intent.toWire()).toWire()).toEqual(intent.toWire());
    for (const invalid of [null, {}, { ...intent.toWire(), target: 'future' }, { ...intent.toWire(), expectedConfigVersion: -1 },
      { ...intent.toWire(), reason: ' untrimmed ' }, { ...intent.toWire(), extra: true }]) expect(Intent.fromWire(invalid)).toBe(Intent.Unknown);
    expect(() => Intent.Unknown.toWire()).toThrow();
    expect(intent.accepts({ ...row, state: State.Active, configVersion: 5 })).toBe(true);
    expect(intent.accepts({ ...row, state: State.Active, configVersion: 6 })).toBe(false);
    expect(intent.accepts({ ...row, id: Module.Favorites, state: State.Active, configVersion: 5 })).toBe(false);
  });
  it('rejects unknown identity/state, invalid versions, same state and illegal transitions before generating UUID', () => {
    const random = vi.fn(uuid);
    for (const invalid of [ { ...row, id: Module.Unknown }, { ...row, state: State.Unknown },
      ...[null, 0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1].map(configVersion => ({ ...row, configVersion }))]) {
      expect(Intent.create(invalid, State.Active, 'valid', random)).toBeNull();
    }
    for (const target of [State.Unknown, State.Disabled, State.Error, State.Paused]) expect(Intent.create(row, target, 'valid', random)).toBeNull();
    for (const reason of ['', '   ', 'x'.repeat(501)]) expect(Intent.create(row, State.Active, reason, random)).toBeNull();
    expect(random).not.toHaveBeenCalled();
    expect(Intent.create(row, State.Active, 'x'.repeat(500), uuid)).not.toBeNull();
    expect(Intent.create(row, State.Active, 'valid', () => 'invalid')).toBeNull();
  });
});
