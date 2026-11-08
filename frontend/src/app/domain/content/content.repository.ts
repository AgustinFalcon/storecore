import { Observable } from 'rxjs';
import { HomeComposition, ReplaceHomeComposition } from './home-composition';
export interface IContentRepository {
  readPublic(): Observable<HomeComposition>;
  readAdmin(): Observable<HomeComposition>;
  replace(command: ReplaceHomeComposition): Observable<HomeComposition>;
}
