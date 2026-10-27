import { firstValueFrom, of } from 'rxjs';
import { CapabilityModuleId } from '../capability-module-id';
import { CapabilityModuleState } from '../capability-module-state';
import { IUserRepository } from '../user.repository';
import { ReadCapabilitiesUseCase } from './read-capabilities.usecase';

describe('ReadCapabilitiesUseCase', () => {
  it('delegates the authoritative read without exposing a mutation command', async () => {
    const modules = [{ id: CapabilityModuleId.Catalog, state: CapabilityModuleState.Active, configVersion: 2 }];
    const listCapabilities = vi.fn(() => of(modules));
    const useCase = new ReadCapabilitiesUseCase({ listCapabilities } as unknown as IUserRepository);
    await expect(firstValueFrom(useCase.execute())).resolves.toEqual(modules);
    expect(listCapabilities).toHaveBeenCalledTimes(1);
  });
});
