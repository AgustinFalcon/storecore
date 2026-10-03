import { map, Observable, throwError } from 'rxjs';
import { manifestLooksUnsafe, redactPreview } from '../profile-manifest';
import { ProfilePreview } from '../user.entity';
import { IUserRepository } from '../user.repository';

const SECRET_ERROR = 'El manifiesto no puede incluir secretos ni credenciales.';

export class ImportProfileUseCase {
  constructor(private readonly repo: IUserRepository) {}

  preview(manifest: string): Observable<ProfilePreview> {
    if (manifestLooksUnsafe(manifest)) {
      return throwError(() => new Error(SECRET_ERROR));
    }
    return this.repo.previewProfile(manifest).pipe(map(redactPreview));
  }

  merge(manifest: string): Observable<ProfilePreview> {
    if (manifestLooksUnsafe(manifest)) {
      return throwError(() => new Error(SECRET_ERROR));
    }
    return this.repo.mergeProfile(manifest).pipe(map(redactPreview));
  }
}
