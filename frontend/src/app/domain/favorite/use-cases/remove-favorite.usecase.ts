import { Observable } from 'rxjs';
import { FavoriteMutationResult } from '../favorite';
import { IFavoriteRepository } from '../favorite.repository';

export class RemoveFavoriteUseCase {
  constructor(private readonly repository: IFavoriteRepository) {}
  execute(sku: string): Observable<FavoriteMutationResult> { return this.repository.remove(sku); }
}
