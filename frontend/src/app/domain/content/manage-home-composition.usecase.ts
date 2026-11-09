import { Observable, throwError } from 'rxjs';
import { IContentRepository } from './content.repository';
import { HomeComposition, validComposition } from './home-composition';
export class ManageHomeCompositionUseCase {
  constructor(private readonly repository: IContentRepository) {}
  load(): Observable<HomeComposition> { return this.repository.readAdmin(); }
  execute(home: HomeComposition): Observable<HomeComposition> {
    if (!validComposition(home)) return throwError(() => new Error('Revisá los campos de los bloques. Quitá los bloques no compatibles antes de publicar.'));
    return this.repository.replace({ expectedRevision: home.revision, sections: home.sections });
  }
}
