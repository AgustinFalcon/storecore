import { NEVER, of, Subject, throwError } from 'rxjs';
import { CapabilityCommandStatus } from '../../domain/user/capability-command-status';
import { IUserRepository } from '../../domain/user/user.repository';
import { CapabilityModuleId } from '../../domain/user/capability-module-id';
import { CapabilityModuleState } from '../../domain/user/capability-module-state';
import { CapabilityModule } from '../../domain/user/user.entity';
import { ManageInstallationUseCase } from '../../domain/user/use-cases/manage-installation.usecase';
import { InstallationStore } from './installation.store';

describe('InstallationStore capability writes', () => {
  it('blocks writes after POST and authoritative GET fail until a successful refresh restores the version', () => {
    const initial: CapabilityModule = { module: CapabilityModuleId.Catalog, state: CapabilityModuleState.ReadOnly, configVersion: 7 };
    const refreshed = { ...initial, configVersion: 8, state: CapabilityModuleState.Paused };
    const listCapabilities = vi.fn()
      .mockReturnValueOnce(of([initial]))
      .mockReturnValueOnce(throwError(() => new Error('GET failed')))
      .mockReturnValueOnce(of([refreshed]));
    const setCapability = vi.fn().mockReturnValueOnce(throwError(() => new Error('POST failed'))).mockReturnValue(NEVER);
    const ops = new ManageInstallationUseCase({
      listCapabilities, setCapability, capabilityCommandStatus: () => of(CapabilityCommandStatus.Unknown),
    } as unknown as IUserRepository);
    const store = new InstallationStore(ops);
    const change = { module: CapabilityModuleId.Catalog, state: CapabilityModuleState.Paused, reason: 'Mantenimiento' };
    store.loadCapabilities();
    store.changeCapability(change);
    expect(setCapability).toHaveBeenCalledTimes(1);
    expect(listCapabilities).toHaveBeenCalledTimes(2);
    expect(store.snapshot.capabilities[0].configVersion).toBeNull();
    store.changeCapability(change);
    expect(setCapability).toHaveBeenCalledTimes(1);
    store.loadCapabilities();
    expect(store.snapshot.capabilities).toEqual([refreshed]);
    store.changeCapability({ ...change, state: CapabilityModuleState.ReadOnly });
    expect(setCapability).toHaveBeenCalledTimes(2);
    expect(setCapability.mock.calls[1][0].expectedConfigVersion).toBe(8);
    store.ngOnDestroy();
  });

  it('uses the latest typed snapshot, ignores overlapping attempts and keeps the returned version', () => {
    const initial: CapabilityModule = { module: CapabilityModuleId.Catalog, state: CapabilityModuleState.ReadOnly, configVersion: 7 };
    const response = new Subject<CapabilityModule>();
    const listCapabilities = vi.fn().mockReturnValueOnce(of([initial])).mockReturnValue(NEVER);
    const setCapability = vi.fn().mockReturnValueOnce(response).mockReturnValue(NEVER);
    const store = new InstallationStore({ listCapabilities, setCapability } as unknown as ManageInstallationUseCase);
    store.loadCapabilities();
    store.changeCapability({ module: CapabilityModuleId.Catalog, state: CapabilityModuleState.Paused, reason: 'Mantenimiento' });
    store.changeCapability({ module: CapabilityModuleId.Catalog, state: CapabilityModuleState.Error, reason: 'Mantenimiento' });
    expect(setCapability).toHaveBeenCalledExactlyOnceWith(initial, CapabilityModuleState.Paused, 'Mantenimiento');
    const updated = { ...initial, state: CapabilityModuleState.Paused, configVersion: 8 };
    response.next(updated);
    response.complete();
    expect(store.snapshot.capabilities).toEqual([updated]);
    store.changeCapability({ module: CapabilityModuleId.Catalog, state: CapabilityModuleState.ReadOnly, reason: 'Mantenimiento' });
    expect(setCapability).toHaveBeenLastCalledWith(updated, CapabilityModuleState.ReadOnly, 'Mantenimiento');
    store.ngOnDestroy();
  });

  it('keeps the effect alive after invalid input so an operator can retry after reload', () => {
    const initial = { module: CapabilityModuleId.Catalog, state: CapabilityModuleState.ReadOnly, configVersion: 7 };
    const setCapability = vi.fn().mockImplementationOnce(() => { throw new Error('invalid version'); }).mockReturnValue(NEVER);
    const store = new InstallationStore({ listCapabilities: () => of([initial]), setCapability } as unknown as ManageInstallationUseCase);
    store.changeCapability({ module: CapabilityModuleId.Catalog, state: CapabilityModuleState.Paused, reason: 'Mantenimiento' });
    expect(setCapability).not.toHaveBeenCalled();
    store.loadCapabilities();
    store.changeCapability({ module: CapabilityModuleId.Catalog, state: CapabilityModuleState.Paused, reason: 'Mantenimiento' });
    expect(store.snapshot.errorMessage).not.toBe('');
    store.loadCapabilities();
    store.changeCapability({ module: CapabilityModuleId.Catalog, state: CapabilityModuleState.Paused, reason: 'Mantenimiento' });
    expect(setCapability).toHaveBeenCalledTimes(2);
    store.ngOnDestroy();
  });
});
