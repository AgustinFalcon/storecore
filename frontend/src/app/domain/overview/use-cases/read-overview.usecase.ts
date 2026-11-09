import { OverviewPeriod } from '../overview';
import { IOverviewRepository } from '../overview.repository';
export class ReadOverviewUseCase {
  constructor(private readonly repository: IOverviewRepository) {}
  execute(period: OverviewPeriod) {
    if (period === OverviewPeriod.Unknown) throw new Error('El período del resumen no es válido.');
    return this.repository.read(period);
  }
}
