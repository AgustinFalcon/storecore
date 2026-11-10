import { firstValueFrom } from 'rxjs';
import { of } from 'rxjs';
import { IHealthRepository } from '../health.repository';
import { GetHealthUseCase } from './get-health.usecase';
import { HealthStatus } from '../health-status';

describe('GetHealthUseCase', () => {
  it('delegates to the health repository port', async () => {
    const repo: IHealthRepository = {
      read: () => of({ status: HealthStatus.Up }),
    };
    const useCase = new GetHealthUseCase(repo);
    const health = await firstValueFrom(useCase.execute());
    expect(health.status).toBe(HealthStatus.Up);
  });
});
