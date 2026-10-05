import { Observable } from 'rxjs';
import { Health } from '../health.entity';
import { IHealthRepository } from '../health.repository';

export class GetHealthUseCase {
  constructor(private readonly repo: IHealthRepository) {}

  execute(): Observable<Health> {
    return this.repo.read();
  }
}
