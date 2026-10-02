import { Observable } from 'rxjs';
import { ManualPromo } from '../user.entity';
import { IUserRepository } from '../user.repository';

export class ManagePromosUseCase {
  constructor(private readonly repo: IUserRepository) {}

  list(): Observable<readonly ManualPromo[]> {
    return this.repo.listPromos();
  }

  save(promo: ManualPromo): Observable<ManualPromo> {
    return this.repo.savePromo(promo);
  }
}
