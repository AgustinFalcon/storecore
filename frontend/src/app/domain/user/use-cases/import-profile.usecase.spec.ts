import { firstValueFrom, of } from 'rxjs';
import { IUserRepository } from '../user.repository';
import { ImportProfileUseCase } from './import-profile.usecase';

describe('ImportProfileUseCase', () => {
  it('rejects a manifest that includes secrets before calling the API', async () => {
    const repo = { previewProfile: () => of({ compatible: true, version: '1', diff: 'ok' }) } as Pick<
      IUserRepository,
      'previewProfile'
    >;
    const useCase = new ImportProfileUseCase(repo as IUserRepository);
    await expect(firstValueFrom(useCase.preview('{"password":"x"}'))).rejects.toThrow(
      'El manifiesto no puede incluir secretos ni credenciales.',
    );
  });
});
