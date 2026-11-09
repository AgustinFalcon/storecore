import { Observable } from 'rxjs';
import { BoundedRows } from '../../catalog/bounded-rows';
import { CreateManualPromo, PolicyTransition } from '../channel-pricing';
import { ManualPromo } from '../user.entity';
import { IUserRepository } from '../user.repository';

export class ManagePromosUseCase {
  constructor(private readonly repo: IUserRepository) {}

  list(page = 0): Observable<BoundedRows<ManualPromo>> {
    return this.repo.listPromos(page);
  }

  save(promo: CreateManualPromo): Observable<ManualPromo> {
    return this.repo.savePromo(promo);
  }
  transition(id: string, transition: PolicyTransition): Observable<ManualPromo> { return this.repo.transitionPromo(id, transition); }
}
