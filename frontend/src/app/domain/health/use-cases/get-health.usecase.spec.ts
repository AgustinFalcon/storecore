import { firstValueFrom } from 'rxjs';
import { of } from 'rxjs';
import { IHealthRepository } from '../health.repository';
import { GetHealthUseCase } from './get-health.usecase';

describe('GetHealthUseCase', () => {
  it('delegates to the health repository port', async () => {
    const repo: IHealthRepository = {
      read: () => of({ status: 'UP' }),
    };
    const useCase = new GetHealthUseCase(repo);
    const health = await firstValueFrom(useCase.execute());
    expect(health.status).toBe('UP');
  });
});
