import { firstValueFrom, of, throwError } from 'rxjs';
import { CapabilityCommandStatus } from '../capability-command-status';
import { CapabilityModuleId } from '../capability-module-id';
import { CapabilityModuleState } from '../capability-module-state';
import { CapabilityModule, CapabilityStateCommand } from '../user.entity';
import { IUserRepository } from '../user.repository';
import { ManageInstallationUseCase } from './manage-installation.usecase';

const current: CapabilityModule = { module: CapabilityModuleId.Catalog, state: CapabilityModuleState.ReadOnly, configVersion: 7 };

describe('ManageInstallationUseCase', () => {
  it('omits unknown modules from the homologation capability list', async () => {
    const repo = {
      listCapabilities: () =>
        of([
          current,
          { ...current, module: CapabilityModuleId.Unknown },
        ]),
    } as Pick<IUserRepository, 'listCapabilities'>;
    const useCase = new ManageInstallationUseCase(repo as IUserRepository);
    await expect(firstValueFrom(useCase.listCapabilities())).resolves.toEqual([
      current,
    ]);
  });

  it('does not change an unknown module from the homologation console', () => {
    const repo = {
      setCapability: () => {
        throw new Error('should not call the API');
      },
    } as Pick<IUserRepository, 'setCapability'>;
    const useCase = new ManageInstallationUseCase(repo as IUserRepository);
    expect(() => useCase.setCapability({ ...current, module: CapabilityModuleId.Unknown }, CapabilityModuleState.Paused, 'Mantenimiento')).toThrow(
      'Este módulo no forma parte de la consola de homologación.',
    );
  });

  it('does not write an unknown current/target state or missing version', () => {
    const write = vi.fn();
    const useCase = new ManageInstallationUseCase({ setCapability: write } as unknown as IUserRepository);
    expect(() => useCase.setCapability({ ...current, state: CapabilityModuleState.Unknown }, CapabilityModuleState.Paused, 'Mantenimiento')).toThrow();
    expect(() => useCase.setCapability(current, CapabilityModuleState.Unknown, 'Mantenimiento')).toThrow();
    for (const configVersion of [null, 0, -1, 1.5, NaN]) {
      expect(() => useCase.setCapability({ ...current, configVersion }, CapabilityModuleState.Paused, 'Mantenimiento')).toThrow();
    }
    expect(write).not.toHaveBeenCalled();
  });

  it('uses the current version and a fresh UUID for a new attempt', async () => {
    const commands: CapabilityStateCommand[] = [];
    const repo = {
      setCapability: (command: CapabilityStateCommand) => {
        commands.push(command);
        return of(current);
      },
    };
    const useCase = new ManageInstallationUseCase(repo as IUserRepository);
    await firstValueFrom(useCase.setCapability(current, CapabilityModuleState.Paused, 'Mantenimiento'));
    expect(commands).toHaveLength(1);
    expect(commands[0].expectedConfigVersion).toBe(7);
    expect(commands[0].module).toBe(CapabilityModuleId.Catalog);
    expect(commands[0].state).toBe(CapabilityModuleState.Paused);
    expect(commands[0].correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    await firstValueFrom(useCase.setCapability({ ...current, configVersion: 8 }, CapabilityModuleState.Paused, 'Mantenimiento'));
    expect(commands[1].correlationId).not.toBe(commands[0].correlationId);
    expect(commands[1].expectedConfigVersion).toBe(8);
  });

  it('reconciles timeout or conflict via correlation and authoritative read without resending', async () => {
    const updated = { ...current, configVersion: 8, state: CapabilityModuleState.Paused };
    const write = vi.fn().mockReturnValue(throwError(() => new Error('timeout')));
    const status = vi.fn().mockReturnValue(of(CapabilityCommandStatus.Completed));
    const read = vi.fn().mockReturnValue(of([updated]));
    const useCase = new ManageInstallationUseCase({ setCapability: write, capabilityCommandStatus: status, listCapabilities: read } as unknown as IUserRepository);
    await expect(firstValueFrom(useCase.setCapability(current, CapabilityModuleState.Paused, 'Mantenimiento'))).rejects.toMatchObject({ snapshot: [updated] });
    expect(write).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledExactlyOnceWith(write.mock.calls[0][0].correlationId);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('never grants ADMIN commands to OPERATOR or unknown roles', async () => {
    const { UserRole } = await import('../user-role');
    const useCase = new ManageInstallationUseCase({ readMe: () => of({ id: 'operator', roles: [UserRole.Operator, UserRole.Unknown] }) } as unknown as IUserRepository);
    await expect(firstValueFrom(useCase.canChangeCapabilities())).resolves.toBe(false);
  });
});
