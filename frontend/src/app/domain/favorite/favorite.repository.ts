import { Observable } from 'rxjs';
import { FavoriteItem, FavoriteMutationResult } from './favorite';

export interface IFavoriteRepository {
  list(): Observable<readonly FavoriteItem[]>;
  add(sku: string): Observable<FavoriteMutationResult>;
  remove(sku: string): Observable<FavoriteMutationResult>;
}
