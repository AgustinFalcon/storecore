import { Inject, Injectable } from '@angular/core';
import { map, Observable, throwError } from 'rxjs';
import { USER_REPOSITORY } from '../../../core/tokens/user.tokens';
import { manifestLooksUnsafe, redactPreview } from '../profile-manifest';
import { ProfilePreview } from '../user.entity';
import { IUserRepository } from '../user.repository';

const SECRET_ERROR = 'El manifiesto no puede incluir secretos ni credenciales.';

@Injectable()
export class ImportProfileUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly repo: IUserRepository) {}

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
