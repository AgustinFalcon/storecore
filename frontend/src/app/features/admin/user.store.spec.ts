import { Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { UserSession } from '../../core/auth/user-session';
import { GetHomeUseCase } from '../../domain/catalog/use-cases/get-home.usecase';
import { ImportProfileUseCase } from '../../domain/user/use-cases/import-profile.usecase';
import { ManagePromosUseCase } from '../../domain/user/use-cases/manage-promos.usecase';
import { SaveHomeContentUseCase } from '../../domain/user/use-cases/save-home-content.usecase';
import { SignInUserUseCase } from '../../domain/user/use-cases/sign-in-user.usecase';
import { SignOutUserUseCase } from '../../domain/user/use-cases/sign-out-user.usecase';
import { ManualPromo, ProfilePreview } from '../../domain/user/user.entity';
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

describe('UserStore promo window', () => {
  it('does not post when hasta is not after desde', () => {
    const save = vi.fn(() => of(promoDraft()));
    const store = createStore({} as ImportProfileUseCase, {} as SaveHomeContentUseCase, {} as GetHomeUseCase, {
      list: () => of([]),
      save,
    } as unknown as ManagePromosUseCase);

    store.setPromoDraft(promoDraft({ validFrom: '2026-09-26T20:00', validTo: '2026-09-26T18:00' }));
    store.persistPromo();
    store.setPromoDraft(promoDraft({ validFrom: '2026-09-26T18:00', validTo: '2026-09-26T18:00' }));
    store.persistPromo();

    expect(save).not.toHaveBeenCalled();
    expect(store.snapshot.loading).toBe(false);
    expect(store.snapshot.errorMessage).toBe('Hasta tiene que ser posterior a desde.');
  });

  it('posts a local day and hour as an instant without rewriting the price', () => {
    const save = vi.fn((promo: ManualPromo) => of(promo));
    const store = createStore({} as ImportProfileUseCase, {} as SaveHomeContentUseCase, {} as GetHomeUseCase, {
      list: () => of([]),
      save,
    } as unknown as ManagePromosUseCase);
    store.setPromoDraft(promoDraft({ validFrom: '2026-09-26T18:00', validTo: '2026-09-26T20:00' }));
    store.persistPromo();

    expect(save).toHaveBeenCalledTimes(1);
    const sent = save.mock.calls[0][0] as ManualPromo;
    expect(sent.writer).toBe('MANUAL');
    expect(sent.validFrom.endsWith('Z')).toBe(true);
    expect(Date.parse(sent.validTo)).toBeGreaterThan(Date.parse(sent.validFrom));
    expect(Date.parse(sent.validFrom)).toBe(Date.parse('2026-09-26T18:00'));
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

  it('re-reads the public home after save when the save body omits blocks', () => {
    const publicHome = vi
      .fn()
      .mockReturnValueOnce(of({ title: 'Viejo', blocks: [] }))
      .mockReturnValueOnce(of({ title: 'Nuevo', blocks: [{ id: 'hero', title: 'Banner nuevo', body: 'Cuerpo nuevo' }] }));
    const save = vi.fn(() => of({ title: 'Banner nuevo', body: 'Cuerpo nuevo' }));
    const store = createStore(
      {} as ImportProfileUseCase,
      { load: () => of({ title: 'Viejo', body: '' }), execute: save } as unknown as SaveHomeContentUseCase,
      { execute: publicHome } as unknown as GetHomeUseCase,
    );

    store.loadHome();
    expect(store.snapshot.homeBlocks).toEqual([]);
    store.setHome({ title: 'Banner nuevo', body: 'Cuerpo nuevo' });
    store.persistHome();

    expect(save).toHaveBeenCalledWith({ title: 'Banner nuevo', body: 'Cuerpo nuevo' });
    expect(publicHome).toHaveBeenCalledTimes(2);
    expect(store.snapshot.homeBlocks).toEqual([{ id: 'hero', title: 'Banner nuevo', body: 'Cuerpo nuevo' }]);
    expect(store.snapshot.loading).toBe(false);
    expect(store.snapshot.errorMessage).toBe('');
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

function promoDraft(overrides: Partial<ManualPromo> = {}): ManualPromo {
  return {
    id: '',
    listingSku: 'SKU-1',
    currency: 'ARS',
    validFrom: '2026-09-26T18:00',
    validTo: '2026-09-26T20:00',
    priority: 1,
    margin: 0,
    approvedBy: '',
    approvedAt: '',
    writer: 'MANUAL',
    ...overrides,
  };
}

function createStore(
  importer: ImportProfileUseCase,
  saveHome: SaveHomeContentUseCase = {} as SaveHomeContentUseCase,
  publicHome: GetHomeUseCase = {} as GetHomeUseCase,
  promos: ManagePromosUseCase = {} as ManagePromosUseCase,
): UserStore {
  const session = { authenticated: () => false } as UserSession;
  return new UserStore(
    {} as SignInUserUseCase,
    {} as SignOutUserUseCase,
    saveHome,
    publicHome,
    promos,
    importer,
    session,
    { navigateByUrl: () => Promise.resolve(true) } as unknown as Router,
  );
}
