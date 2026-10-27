import { CapabilityFilter } from './capability-filter';
import { CapabilityModuleId } from './capability-module-id';
import { CapabilityModuleState } from './capability-module-state';
import { CapabilityTargetPolicy } from './capability-target-policy';
import { DeliveryLevel } from './delivery-level';
import { ModuleAvailability } from './module-availability';
import { OwnedSurfaceLink } from './owned-surface-link';
import { UserRole } from './user-role';

describe('capability closed domain', () => {
  it('decodes all bounded values and fails closed without leaking raw values', () => {
    expect(CapabilityModuleId.fromWire('CATALOG')).toBe(CapabilityModuleId.Catalog);
    expect(CapabilityModuleId.fromWire('BLACKSTORE_INTEGRATION')).toBe(CapabilityModuleId.Unknown);
    expect(CapabilityModuleState.fromWire('ACTIVE')).toBe(CapabilityModuleState.Active);
    expect(CapabilityModuleState.fromWire('active')).toBe(CapabilityModuleState.Unknown);
    expect(ModuleAvailability.fromWire('AVAILABLE')).toBe(ModuleAvailability.Available);
    expect(DeliveryLevel.fromWire('INTEGRATED')).toBe(DeliveryLevel.Integrated);
    expect(OwnedSurfaceLink.fromWire('garbage')).toBe(OwnedSurfaceLink.None);
  });

  it('keeps navigation and authorization inside closed objects', () => {
    expect(OwnedSurfaceLink.Catalog.isAvailable).toBe(true);
    expect(OwnedSurfaceLink.None.isAvailable).toBe(false);
    expect(CapabilityTargetPolicy.RealReadOnly.permits([UserRole.Operator])).toBe(true);
    expect(CapabilityTargetPolicy.RealReadOnly.allowsMutation).toBe(false);
    expect(CapabilityTargetPolicy.fromWire('other').permits([UserRole.Admin])).toBe(false);
  });

  it('filters typed module state without magic strings', () => {
    const module = { id: CapabilityModuleId.Catalog, state: CapabilityModuleState.Error, configVersion: 1 };
    expect(CapabilityFilter.Attention.matches(module)).toBe(true);
    expect(CapabilityFilter.Active.matches(module)).toBe(false);
    expect(CapabilityFilter.fromWire('missing')).toBe(CapabilityFilter.Unknown);
  });
});
