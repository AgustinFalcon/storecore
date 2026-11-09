import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { HomeContentPhase as Phase } from '../../domain/user/home-content-phase';
import { HomeBlockKind as Kind, HomeComposition } from '../../domain/content/home-composition';
import { ManageHomeCompositionUseCase } from '../../domain/content/manage-home-composition.usecase';
import { UserRole } from '../../domain/user/user-role';
import { UserContentStore } from './user-content.store';
const published: HomeComposition = {revision: 3, sections: [{key: 'hero', kind: Kind.Hero, active: true, sortOrder: 0, content: {title: 'Publicada', body: 'Original'}, updatedAt: null}]};
const edited = (title = 'Nueva'): HomeComposition => ({...published, sections: [{...published.sections[0], content: {title, body: 'Editado'}}]});
function setup() {
  const usecase = {load: vi.fn(() => of(published)), execute: vi.fn((home: HomeComposition) => of({...home, revision: home.revision + 1}))};
  const store = new UserContentStore(usecase as unknown as ManageHomeCompositionUseCase);
  store.setActor({id: 'admin', roles: [UserRole.Admin]});
  return {store, usecase};
}
describe('composition editor store', () => {
  it('protects unloaded state, preserves a confirmed snapshot and discards a full composition', () => {
    const {store, usecase} = setup(); store.edit(edited()); expect(store.snapshot.home.sections).toEqual([]);
    store.load(); expect(store.snapshot.phase).toBe(Phase.Clean); store.edit(edited());
    store.load(); expect(usecase.load).toHaveBeenCalledTimes(1); expect(store.dirty).toBe(true);
    store.discard(); expect(store.snapshot.home).toEqual(published); expect(store.dirty).toBe(false); store.ngOnDestroy();
  });
  it('validates every block and prevents duplicate or concurrent publication', () => {
    const {store, usecase} = setup(); store.load(); store.edit(edited('')); store.publish();
    expect(store.snapshot.phase).toBe(Phase.Invalid); expect(usecase.execute).not.toHaveBeenCalled();
    const response = new Subject<HomeComposition>(); usecase.execute.mockReturnValue(response);
    store.edit(edited()); store.publish(); store.publish(); store.edit(edited('Ignored')); store.discard();
    expect(usecase.execute).toHaveBeenCalledTimes(1); expect(store.snapshot.home.sections[0].content.title).toBe('Nueva');
    response.next({...edited('Confirmada'), revision: 4}); response.complete();
    expect(store.snapshot.phase).toBe(Phase.Success); expect(store.snapshot.home.revision).toBe(4); expect(store.dirty).toBe(false); store.ngOnDestroy();
  });
  it('keeps dirty edits on transport failure and permits explicit retry', () => {
    const {store, usecase} = setup(); store.load(); store.edit(edited());
    usecase.execute.mockReturnValueOnce(throwError(() => new Error('Sin conexión')));
    store.publish(); expect(store.snapshot.phase).toBe(Phase.Error); expect(store.dirty).toBe(true);
    store.publish(); expect(store.snapshot.phase).toBe(Phase.Success); expect(store.dirty).toBe(false); store.ngOnDestroy();
  });
  it('preserves the draft on 409, blocks stale retries, explicitly reloads latest baseline and retries its revision', () => {
    const {store, usecase} = setup(); store.load(); store.edit(edited());
    usecase.execute.mockReturnValueOnce(throwError(() => new HttpErrorResponse({status: 409})));
    store.publish(); expect(store.snapshot.phase).toBe(Phase.Conflict); expect(store.dirty).toBe(true);
    store.publish(); expect(usecase.execute).toHaveBeenCalledTimes(1);
    usecase.load.mockReturnValueOnce(of({...edited('Remota'), revision: 5})); store.load();
    expect(store.snapshot.published?.sections[0].content.title).toBe('Remota');
    expect(store.snapshot.home.sections[0].content.title).toBe('Nueva'); expect(store.snapshot.home.revision).toBe(5);
    expect(store.snapshot.conflict).toBe(false); expect(store.dirty).toBe(true);
    store.publish(); expect(usecase.execute.mock.calls[1][0].revision).toBe(5); expect(store.snapshot.home.revision).toBe(6); store.ngOnDestroy();
  });
  it('invalidates late reads and writes on actor changes, logout, destruction and denies operators', () => {
    const {store, usecase} = setup(); const read = new Subject<HomeComposition>(); usecase.load.mockReturnValueOnce(read);
    store.load(); store.setActor(null); read.next(published); expect(store.snapshot.published).toBeNull();
    store.setActor({id: 'operator', roles: [UserRole.Operator]}); store.load(); expect(usecase.load).toHaveBeenCalledTimes(1);
    store.setActor({id: 'admin', roles: [UserRole.Admin]}); store.load(); store.edit(edited());
    const write = new Subject<HomeComposition>(); usecase.execute.mockReturnValue(write); store.publish(); store.setActor(null);
    write.next(published); expect(store.snapshot.home.sections).toEqual([]); expect(store.snapshot.phase).toBe(Phase.AccessDenied); store.ngOnDestroy();
  });
  it('blocks unknown legacy and permits removing it by an explicit valid replacement', () => {
    const {store, usecase} = setup(); store.load();
    store.edit({...published, sections: [{...published.sections[0], kind: Kind.Unknown}]}); store.publish();
    expect(usecase.execute).not.toHaveBeenCalled(); store.edit({...published, sections: []}); store.publish();
    expect(usecase.execute).toHaveBeenCalledTimes(1); expect(store.snapshot.home.sections).toEqual([]); store.ngOnDestroy();
  });
});
