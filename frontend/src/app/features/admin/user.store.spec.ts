import { Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { UserSession } from '../../core/auth/user-session';
import { ImportProfileUseCase } from '../../domain/user/use-cases/import-profile.usecase';
import { ManagePromosUseCase } from '../../domain/user/use-cases/manage-promos.usecase';
import { SaveHomeContentUseCase } from '../../domain/user/use-cases/save-home-content.usecase';
import { SignInUserUseCase } from '../../domain/user/use-cases/sign-in-user.usecase';
import { SignOutUserUseCase } from '../../domain/user/use-cases/sign-out-user.usecase';
import { ProfilePreview } from '../../domain/user/user.entity';
import { UserStore } from './user.store';

describe('UserStore profile preview', () => {
  it('invalidates a preview and ignores its late response after the manifest changes', () => {
    const response = new Subject<ProfilePreview>();
    const preview = vi.fn(() => response.asObservable());
    const merge = vi.fn(() => of({ compatible: true, version: '1', diff: '' }));
    const store = createStore({ preview, merge } as unknown as ImportProfileUseCase);
    const oldPreview = { compatible: true, version: 'old', diff: '' };

    store.setManifest('manifest A');
    store.previewProfile();
    store.setManifest('manifest B');
    response.next(oldPreview);
    store.mergeProfile();

    expect(store.snapshot.preview).toBeNull();
    expect(store.snapshot.previewManifest).toBeNull();
    expect(merge).not.toHaveBeenCalled();
  });

  it('allows merge only for a preview belonging to the current manifest', () => {
    const preview = vi.fn(() => of({ compatible: true, version: '1', diff: '' }));
    const merge = vi.fn(() => of({ compatible: true, version: '1', diff: '' }));
    const store = createStore({ preview, merge } as unknown as ImportProfileUseCase);

    store.setManifest('manifest A');
    store.previewProfile();
    expect(store.snapshot.previewManifest).toBe('manifest A');
    store.mergeProfile();
    expect(merge).toHaveBeenCalledWith('manifest A');

    store.setManifest('manifest B');
    store.mergeProfile();
    expect(merge).toHaveBeenCalledTimes(1);
  });
});

function createStore(importer: ImportProfileUseCase): UserStore {
  const session = { authenticated: () => false } as UserSession;
  return new UserStore(
    {} as SignInUserUseCase,
    {} as SignOutUserUseCase,
    {} as SaveHomeContentUseCase,
    {} as ManagePromosUseCase,
    importer,
    session,
    { navigateByUrl: () => Promise.resolve(true) } as unknown as Router,
  );
}
