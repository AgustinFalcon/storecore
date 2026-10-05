import { Observable } from 'rxjs';
import { ICatalogRepository } from '../catalog.repository';
import { HomeContent } from '../home-content.entity';

export class GetHomeUseCase {
  constructor(private readonly repo: ICatalogRepository) {}

  execute(): Observable<HomeContent> {
    return this.repo.readHome();
  }
}
