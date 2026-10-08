import { CapabilityModuleId } from '../../domain/user/capability-module-id';
import { CapabilityModuleState } from '../../domain/user/capability-module-state';
import { UserCapabilitiesViewComponent } from './user-capabilities.view';

describe('UserCapabilitiesViewComponent', () => {
  it('emits closed objects and blocks Unknown state and missing versions', () => {
    const view = new UserCapabilitiesViewComponent();
    view.canWrite = true;
    view.reason = 'Mantenimiento';
    const emit = vi.spyOn(view.changeState, 'emit');
    const item = { module: CapabilityModuleId.Catalog, state: CapabilityModuleState.ReadOnly, configVersion: 4 };
    view.emitChange(item, CapabilityModuleState.Paused);
    expect(emit).toHaveBeenCalledExactlyOnceWith({ module: CapabilityModuleId.Catalog, state: CapabilityModuleState.Paused, reason: 'Mantenimiento' });
    emit.mockClear();
    view.emitChange({ ...item, state: CapabilityModuleState.Unknown }, CapabilityModuleState.Paused);
    view.emitChange({ ...item, configVersion: null }, CapabilityModuleState.Paused);
    view.emitChange({ ...item, module: CapabilityModuleId.Unknown }, CapabilityModuleState.Paused);
    view.emitChange(item, CapabilityModuleState.Unknown);
    view.canWrite = false;
    view.emitChange(item, CapabilityModuleState.Paused);
    view.canWrite = true;
    view.reason = ' ';
    view.emitChange(item, CapabilityModuleState.Paused);
    expect(emit).not.toHaveBeenCalled();
  });
});
