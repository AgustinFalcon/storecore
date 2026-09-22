import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HEALTH_REPOSITORY } from '../../../core/tokens/health.tokens';
import { Health } from '../health.entity';
import { IHealthRepository } from '../health.repository';

@Injectable()
export class GetHealthUseCase {
  constructor(@Inject(HEALTH_REPOSITORY) private readonly repo: IHealthRepository) {}

  execute(): Observable<Health> {
    return this.repo.read();
  }
}
