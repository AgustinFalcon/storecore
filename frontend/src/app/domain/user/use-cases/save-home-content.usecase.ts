import { Observable } from 'rxjs';
import { HomeContentDraft } from '../user.entity';
import { IUserRepository } from '../user.repository';

export class SaveHomeContentUseCase {
  constructor(private readonly repo: IUserRepository) {}

  load(): Observable<HomeContentDraft> {
    return this.repo.readHome();
  }

  execute(draft: HomeContentDraft): Observable<HomeContentDraft> {
    return this.repo.saveHome(draft);
  }
}
