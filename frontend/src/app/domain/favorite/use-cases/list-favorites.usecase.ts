import { Observable } from 'rxjs';
import { FavoriteItem } from '../favorite';
import { IFavoriteRepository } from '../favorite.repository';

export class ListFavoritesUseCase {
  constructor(private readonly repository: IFavoriteRepository) {}
  execute(): Observable<readonly FavoriteItem[]> { return this.repository.list(); }
}
