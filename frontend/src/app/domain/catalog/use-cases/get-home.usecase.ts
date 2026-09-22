import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CATALOG_REPOSITORY } from '../../../core/tokens/catalog.tokens';
import { ICatalogRepository } from '../catalog.repository';
import { HomeContent } from '../home-content.entity';

@Injectable()
export class GetHomeUseCase {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: ICatalogRepository) {}

  execute(): Observable<HomeContent> {
    return this.repo.readHome();
  }
}
