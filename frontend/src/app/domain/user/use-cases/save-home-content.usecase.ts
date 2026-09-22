import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { USER_REPOSITORY } from '../../../core/tokens/user.tokens';
import { HomeContentDraft } from '../user.entity';
import { IUserRepository } from '../user.repository';

@Injectable()
export class SaveHomeContentUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly repo: IUserRepository) {}

  load(): Observable<HomeContentDraft> {
    return this.repo.readHome();
  }

  execute(draft: HomeContentDraft): Observable<HomeContentDraft> {
    return this.repo.saveHome(draft);
  }
}
