import { Observable } from 'rxjs';
import { IContentRepository } from '../../content/content.repository';
import { HomeComposition } from '../../content/home-composition';

export class GetHomeUseCase {
  constructor(private readonly repo: IContentRepository) {}

  execute(): Observable<HomeComposition> {
    return this.repo.readPublic();
  }
}
