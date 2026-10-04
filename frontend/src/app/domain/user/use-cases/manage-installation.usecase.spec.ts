import { defer, firstValueFrom, of, retry, throwError } from 'rxjs';
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
    expect(() => useCase.setCapability({ ...current, module: CapabilityModuleId.Unknown }, CapabilityModuleState.Paused)).toThrow(
      'Este módulo no forma parte de la consola de homologación.',
    );
  });

  it('does not write an unknown current/target state or missing version', () => {
    const write = vi.fn();
    const useCase = new ManageInstallationUseCase({ setCapability: write } as unknown as IUserRepository);
    expect(() => useCase.setCapability({ ...current, state: CapabilityModuleState.Unknown }, CapabilityModuleState.Paused)).toThrow();
    expect(() => useCase.setCapability(current, CapabilityModuleState.Unknown)).toThrow();
    for (const configVersion of [null, 0, -1, 1.5, NaN]) {
      expect(() => useCase.setCapability({ ...current, configVersion }, CapabilityModuleState.Paused)).toThrow();
    }
    expect(write).not.toHaveBeenCalled();
  });

  it('uses the current version and one UUID across retries, with a fresh UUID for a new attempt', async () => {
    const commands: CapabilityStateCommand[] = [];
    let subscriptions = 0;
    const repo = {
      setCapability: (command: CapabilityStateCommand) => {
        commands.push(command);
        return defer(() => ++subscriptions === 1 ? throwError(() => new Error('transport')) : of(current));
      },
    };
    const useCase = new ManageInstallationUseCase(repo as IUserRepository);
    await firstValueFrom(useCase.setCapability(current, CapabilityModuleState.Paused).pipe(retry(1)));
    expect(subscriptions).toBe(2);
    expect(commands).toHaveLength(1);
    expect(commands[0].expectedConfigVersion).toBe(7);
    expect(commands[0].module).toBe(CapabilityModuleId.Catalog);
    expect(commands[0].state).toBe(CapabilityModuleState.Paused);
    expect(commands[0].correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    await firstValueFrom(useCase.setCapability({ ...current, configVersion: 8 }, CapabilityModuleState.Paused));
    expect(commands[1].correlationId).not.toBe(commands[0].correlationId);
    expect(commands[1].expectedConfigVersion).toBe(8);
  });
});
