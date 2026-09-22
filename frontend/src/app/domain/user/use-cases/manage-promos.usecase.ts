import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { USER_REPOSITORY } from '../../../core/tokens/user.tokens';
import { ManualPromo } from '../user.entity';
import { IUserRepository } from '../user.repository';

@Injectable()
export class ManagePromosUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly repo: IUserRepository) {}

  list(): Observable<readonly ManualPromo[]> {
    return this.repo.listPromos();
  }

  save(promo: ManualPromo): Observable<ManualPromo> {
    return this.repo.savePromo(promo);
  }
}
