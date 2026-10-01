import { firstValueFrom, of } from 'rxjs';
import { IUserRepository } from '../user.repository';
import { ManageInstallationUseCase } from './manage-installation.usecase';

describe('ManageInstallationUseCase', () => {
  it('omits unknown modules from the homologation capability list', async () => {
    const repo = {
      listCapabilities: () =>
        of([
          { module: 'STOREFRONT', state: 'ACTIVE' as const },
          { module: 'NOT_A_MODULE', state: 'DISABLED' as const },
        ]),
    } as Pick<IUserRepository, 'listCapabilities'>;
    const useCase = new ManageInstallationUseCase(repo as IUserRepository);
    await expect(firstValueFrom(useCase.listCapabilities())).resolves.toEqual([
      { module: 'STOREFRONT', state: 'ACTIVE' },
    ]);
  });

  it('does not change an unknown module from the homologation console', () => {
    const repo = {
      setCapability: () => {
        throw new Error('should not call the API');
      },
    } as Pick<IUserRepository, 'setCapability'>;
    const useCase = new ManageInstallationUseCase(repo as IUserRepository);
    expect(() => useCase.setCapability('NOT_A_MODULE', 'ACTIVE')).toThrow(
      'Este módulo no forma parte de la consola de homologación.',
    );
  });
});
