import { CapabilityModuleState } from './capability-module-state';

describe('CapabilityModuleState', () => {
  it('translates known wires once', () => {
    expect(CapabilityModuleState.fromWire('ACTIVE')).toBe(CapabilityModuleState.Active);
    expect(CapabilityModuleState.fromWire('DISABLED').label).toBe('Apagado');
    expect(CapabilityModuleState.fromWire('READ_ONLY').tone).toBe('info');
  });

  it('does not treat an unknown wire as a valid state', () => {
    const state = CapabilityModuleState.fromWire('FLAG_ON');
    expect(state).toBe(CapabilityModuleState.Unknown);
    expect(state.label).toBe('Estado no reconocido');
  });
});
