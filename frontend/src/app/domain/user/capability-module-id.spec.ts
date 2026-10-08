import { CapabilityModuleId } from './capability-module-id';

describe('CapabilityModuleId', () => {
  it('keeps the web commerce modules visible', () => {
    expect(CapabilityModuleId.fromWire('STOREFRONT').homologationVisible).toBe(true);
    expect(CapabilityModuleId.fromWire('CATALOG').homologationVisible).toBe(true);
    expect(CapabilityModuleId.fromWire('PAYMENTS_MP').homologationVisible).toBe(true);
    expect(CapabilityModuleId.fromWire('MARKETPLACE_ML').homologationVisible).toBe(true);
    expect(CapabilityModuleId.fromWire('STOREFRONT').label).toBe('Vitrina');
  });

  it('hides an unknown wire from the homologation console', () => {
    const module = CapabilityModuleId.fromWire('NOT_A_MODULE');
    expect(module).toBe(CapabilityModuleId.Unknown);
    expect(module.wire).toBe('');
    expect(module.homologationVisible).toBe(false);
    expect(module.isUnknown).toBe(true);
  });

  it('maps companion, whitespace, case variants and arbitrary wires to the same fixed Unknown', () => {
    for (const raw of ['BLACKSTORE_INTEGRATION', ' CATALOG ', 'catalog', 'OTHER', '', null, undefined]) {
      expect(CapabilityModuleId.fromWire(raw)).toBe(CapabilityModuleId.Unknown);
    }
  });

  it('does not print a blank wire as a visible module', () => {
    expect(CapabilityModuleId.fromWire('').homologationVisible).toBe(false);
    expect(CapabilityModuleId.fromWire(null).homologationVisible).toBe(false);
  });

  it('exposes a commerce label and never prints an unknown wire', () => {
    expect(CapabilityModuleId.fromWire('STOREFRONT').label).toBe('Vitrina');
    expect(CapabilityModuleId.fromWire('MARKETPLACE_ML').label).toBe('Mercado Libre');
    expect(CapabilityModuleId.fromWire('NOT_A_MODULE').label).toBe('Módulo no disponible');
  });
});
