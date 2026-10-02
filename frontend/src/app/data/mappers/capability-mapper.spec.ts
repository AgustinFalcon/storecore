import { CapabilityModuleId } from '../../domain/user/capability-module-id';
import { CapabilityModuleState } from '../../domain/user/capability-module-state';
import { mapCapability } from './http-mappers';

describe('capability HTTP boundary', () => {
  it('translates known wires and preserves the config version', () => {
    expect(mapCapability({ module: 'CATALOG', state: 'READ_ONLY', configVersion: 12 })).toEqual({
      module: CapabilityModuleId.Catalog, state: CapabilityModuleState.ReadOnly, configVersion: 12,
    });
  });

  it('preserves Unknown state rather than claiming Disabled and drops arbitrary module wires', () => {
    const value = mapCapability({ module: 'PRIVATE_MODULE', state: 'INVALID', configVersion: 3 });
    expect(value.module).toBe(CapabilityModuleId.Unknown);
    expect(value.module.wire).toBe('');
    expect(value.state).toBe(CapabilityModuleState.Unknown);
    expect(value.state).not.toBe(CapabilityModuleState.Disabled);
    expect(value.configVersion).toBe(3);
  });

  it('does not invent a version for malformed or missing fields', () => {
    for (const configVersion of [undefined, null, '1', 0, -1, 1.2, Infinity]) {
      expect(mapCapability({ configVersion }).configVersion).toBeNull();
    }
    expect(mapCapability(null).state).toBe(CapabilityModuleState.Unknown);
  });

  it('does not coerce non-string JSON values into known wires', () => {
    const value = mapCapability({ module: ['CATALOG'], state: ['ACTIVE'], configVersion: 2 });
    expect(value.module).toBe(CapabilityModuleId.Unknown);
    expect(value.state).toBe(CapabilityModuleState.Unknown);
  });
});
