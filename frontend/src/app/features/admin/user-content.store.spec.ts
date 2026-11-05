import { of, Subject, throwError } from 'rxjs';
import { HomeContentPhase } from '../../domain/user/home-content-phase';
import { HomeContentDraft } from '../../domain/user/user.entity';
import { UserRole } from '../../domain/user/user-role';
import { SaveHomeContentUseCase } from '../../domain/user/use-cases/save-home-content.usecase';
import { UserContentStore } from './user-content.store';

const published = { title: 'Portada publicada', body: 'Texto original' };
function createStore() {
  const usecase = { load: vi.fn(() => of(published)), execute: vi.fn((home: HomeContentDraft) => of(home)) };
  const store = new UserContentStore(usecase as unknown as SaveHomeContentUseCase);
  store.setActor({ id: 'admin-a', roles: [UserRole.Admin] });
  return { store, usecase };
}

describe('UserContentStore', () => {
  it('loads a confirmed snapshot, marks edits dirty and discards only to that snapshot', () => {
    const { store } = createStore();
    store.edit({ title: 'Prematuro', body: '' });
    expect(store.snapshot.home.title).toBe('');
    store.load();
    expect(store.snapshot.phase).toBe(HomeContentPhase.Clean);
    store.edit({ ...published, body: 'Texto nuevo' });
    expect(store.dirty).toBe(true);
    expect(store.snapshot.phase).toBe(HomeContentPhase.Editing);
    store.load();
    expect(store.snapshot.home.body).toBe('Texto nuevo');
    store.discard();
    expect(store.snapshot.home).toEqual(published);
    expect(store.dirty).toBe(false);
    store.ngOnDestroy();
  });

  it('requires a title, locks during publication and accepts the server confirmed snapshot', () => {
    const { store, usecase } = createStore();
    store.load(); store.publish();
    expect(usecase.execute).not.toHaveBeenCalled();
    store.edit({ title: ' ', body: 'Nuevo' }); store.publish();
    expect(store.snapshot.phase).toBe(HomeContentPhase.Invalid);
    expect(usecase.execute).not.toHaveBeenCalled();
    const result = new Subject<HomeContentDraft>();
    usecase.execute.mockReturnValue(result);
    store.edit({ title: 'Nueva portada', body: 'Nuevo' }); store.publish(); store.publish();
    expect(store.snapshot.phase).toBe(HomeContentPhase.Saving);
    expect(usecase.execute).toHaveBeenCalledTimes(1);
    store.edit({ title: 'No debe cambiar', body: '' }); store.discard(); store.load();
    expect(store.snapshot.home.title).toBe('Nueva portada');
    result.next({ title: 'Título confirmado', body: 'Texto confirmado' }); result.complete();
    expect(store.snapshot.phase).toBe(HomeContentPhase.Success);
    expect(store.snapshot.home.title).toBe('Título confirmado');
    expect(store.dirty).toBe(false);
    store.ngOnDestroy();
  });

  it('keeps edits after publication failure and retries explicitly without duplicating the command', () => {
    const { store, usecase } = createStore();
    store.load(); store.edit({ ...published, body: 'Conservar este texto' });
    usecase.execute.mockReturnValueOnce(throwError(() => new Error('Sin conexión')));
    store.publish();
    expect(store.snapshot.phase).toBe(HomeContentPhase.Error);
    expect(store.snapshot.errorMessage).toBe('Sin conexión');
    expect(store.snapshot.home.body).toBe('Conservar este texto');
    expect(store.dirty).toBe(true);
    store.publish();
    expect(usecase.execute).toHaveBeenCalledTimes(2);
    expect(store.snapshot.phase).toBe(HomeContentPhase.Success);
    expect(store.dirty).toBe(false);
    store.ngOnDestroy();
  });

  it('recovers after an initial load error and ignores late publication after destroy', () => {
    const { store, usecase } = createStore();
    usecase.load.mockReturnValueOnce(throwError(() => new Error('Sin conexión')));
    store.load(); expect(store.snapshot.published).toBeNull();
    expect(store.snapshot.phase).toBe(HomeContentPhase.Error);
    store.load(); expect(store.snapshot.published).toEqual(published);
    const response = new Subject<HomeContentDraft>(); usecase.execute.mockReturnValue(response);
    store.edit({ ...published, title: 'Nueva' }); store.publish(); store.ngOnDestroy();
    response.next({ title: 'Tardía', body: '' });
    expect(store.snapshot.home.title).toBe('Nueva');
  });

  it('clears private edits on logout or actor change and ignores late publication', () => {
    const { store, usecase } = createStore(); store.load();
    const response = new Subject<HomeContentDraft>(); usecase.execute.mockReturnValue(response);
    store.edit({ title: 'Edición privada', body: '' }); store.publish(); store.setActor(null);
    expect(store.snapshot.published).toBeNull(); expect(store.snapshot.home.title).toBe('');
    expect(store.snapshot.phase).toBe(HomeContentPhase.AccessDenied); expect(store.dirty).toBe(false);
    response.next({ title: 'Respuesta tardía', body: '' });
    expect(store.snapshot.home.title).toBe('');
    store.load(); expect(usecase.load).toHaveBeenCalledTimes(1);
    store.setActor({ id: 'operator-b', roles: [UserRole.Operator] }); store.load();
    expect(store.snapshot.home).toEqual(published);
    store.ngOnDestroy();
  });
});
