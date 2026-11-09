import { of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { UserSession } from '../../core/auth/user-session';
import { UserRole } from '../../domain/user/user-role';
import { HomeContentPhase } from '../../domain/user/home-content-phase';
import { ManageHomeCompositionUseCase } from '../../domain/content/manage-home-composition.usecase';
import { HomeBlockKind } from '../../domain/content/home-composition';
import { UserContentComponent } from './user-content.component';
import { UserContentStore } from './user-content.store';

describe('UserContent navigation protection', () => {
  function setup() {
    const store = new UserContentStore({ load: () => of({ revision: 1, sections: [] }) } as unknown as ManageHomeCompositionUseCase);
    const session = new UserSession(); session.commit({ id: 'admin-a', roles: [UserRole.Admin] }, 'csrf');
    store.setActor(session.principal());
    store.load();
    return { store, session, component: TestBed.runInInjectionContext(() => new UserContentComponent(store, session)) };
  }

  afterEach(() => vi.restoreAllMocks());

  it('keeps edits when leaving is cancelled and restores confirmed content after explicit discard', () => {
    const { store, component } = setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(component.canDeactivate()).toBe(true); expect(confirm).not.toHaveBeenCalled();
    store.edit({...store.snapshot.home, sections: [{key: 'hero', kind: HomeBlockKind.Hero, active: true, sortOrder: 0, content: {title: 'Edición', body: ''}, updatedAt: null}]});
    expect(component.canDeactivate()).toBe(false); expect(store.dirty).toBe(true);
    confirm.mockReturnValue(true);
    expect(component.canDeactivate()).toBe(true); expect(store.snapshot.home.revision).toBe(1);
    store.ngOnDestroy();
  });

  it('requires confirmation for discard and protects browser exit and active publication', () => {
    const { store, component } = setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    store.edit({...store.snapshot.home, sections: [{key: 'hero', kind: HomeBlockKind.Hero, active: true, sortOrder: 0, content: {title: 'Edición', body: ''}, updatedAt: null}]}); component.discard(); expect(store.dirty).toBe(true);
    const event = { preventDefault: vi.fn(), returnValue: 'initial' } as unknown as BeforeUnloadEvent;
    component.beforeUnload(event); expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe('');
    confirm.mockReturnValue(true); component.discard(); expect(store.dirty).toBe(false);
    store.patchState({ phase: HomeContentPhase.Saving });
    expect(component.canDeactivate()).toBe(false);
    store.ngOnDestroy();
  });

  it('allows completed logout to leave immediately and removes private editing state', () => {
    const { store, session, component } = setup();
    const confirm = vi.spyOn(window, 'confirm'); store.edit({...store.snapshot.home, sections: [{key: 'hero', kind: HomeBlockKind.Hero, active: true, sortOrder: 0, content: {title: 'Privado', body: ''}, updatedAt: null}]});
    session.clear(); expect(component.canDeactivate()).toBe(true);
    expect(confirm).not.toHaveBeenCalled(); expect(store.snapshot.home.sections).toEqual([]);
    expect(store.snapshot.published).toBeNull(); store.ngOnDestroy();
  });
});
