import { Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { UserSession } from '../../core/auth/user-session';
import { GetHomeUseCase } from '../../domain/catalog/use-cases/get-home.usecase';
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

  it('does not let an old merge response replace an incompatible preview for a new manifest', () => {
    const oldMerge = new Subject<ProfilePreview>();
    const preview = vi.fn((manifest: string) => of({ compatible: manifest === 'manifest A', version: manifest, diff: '' }));
    const merge = vi.fn(() => oldMerge.asObservable());
    const store = createStore({ preview, merge } as unknown as ImportProfileUseCase);

    store.setManifest('manifest A');
    store.previewProfile();
    store.mergeProfile();
    store.setManifest('manifest B');
    store.previewProfile();
    oldMerge.next({ compatible: true, version: 'stale A', diff: '' });
    store.mergeProfile();

    expect(store.snapshot.preview).toEqual({ compatible: false, version: 'manifest B', diff: '' });
    expect(store.snapshot.previewManifest).toBe('manifest B');
    expect(merge).toHaveBeenCalledTimes(1);
  });

  it('does not start two merge requests for repeated clicks while one is pending', () => {
    const oldMerge = new Subject<ProfilePreview>();
    const preview = vi.fn(() => of({ compatible: true, version: '1', diff: '' }));
    const merge = vi.fn(() => oldMerge.asObservable());
    const store = createStore({ preview, merge } as unknown as ImportProfileUseCase);

    store.setManifest('manifest A');
    store.previewProfile();
    store.mergeProfile();
    store.mergeProfile();

    expect(merge).toHaveBeenCalledTimes(1);
    oldMerge.next({ compatible: true, version: 'merged', diff: '' });
    oldMerge.complete();
    expect(store.snapshot.loading).toBe(false);
  });
});

describe('UserStore home blocks', () => {
  it('shows the public home blocks when the console payload omits them', () => {
    const store = createStore(
      {} as ImportProfileUseCase,
      { load: () => of({ title: 'Vidriera', body: 'Texto' }) } as unknown as SaveHomeContentUseCase,
      {
        execute: () => of({ title: 'Vidriera', blocks: [{ id: 'hero', title: 'Banner', body: 'Cuerpo del banner' }] }),
      } as unknown as GetHomeUseCase,
    );

    store.loadHome();

    expect(store.snapshot.home).toEqual({ title: 'Vidriera', body: 'Texto' });
    expect(store.snapshot.homeBlocks).toEqual([{ id: 'hero', title: 'Banner', body: 'Cuerpo del banner' }]);
  });

  it('does not claim an empty banner when the public home fails', () => {
    const store = createStore(
      {} as ImportProfileUseCase,
      { load: () => of({ title: 'Vidriera', body: 'Texto' }) } as unknown as SaveHomeContentUseCase,
      { execute: () => throwError(() => new Error('caido')) } as unknown as GetHomeUseCase,
    );

    store.loadHome();

    expect(store.snapshot.homeBlocks).toBeNull();
    expect(store.snapshot.errorMessage).not.toBe('');
  });
});

function createStore(
  importer: ImportProfileUseCase,
  saveHome: SaveHomeContentUseCase = {} as SaveHomeContentUseCase,
  publicHome: GetHomeUseCase = {} as GetHomeUseCase,
): UserStore {
  const session = { authenticated: () => false } as UserSession;
  return new UserStore(
    {} as SignInUserUseCase,
    {} as SignOutUserUseCase,
    saveHome,
    publicHome,
    {} as ManagePromosUseCase,
    importer,
    session,
    { navigateByUrl: () => Promise.resolve(true) } as unknown as Router,
  );
}
