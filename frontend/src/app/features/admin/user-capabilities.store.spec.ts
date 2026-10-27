import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, Subject, throwError } from 'rxjs';
import { CapabilityFilter } from '../../domain/user/capability-filter';
import { CapabilityModuleId } from '../../domain/user/capability-module-id';
import { CapabilityModuleState } from '../../domain/user/capability-module-state';
import { UserRole } from '../../domain/user/user-role';
import { CapabilityModule } from '../../domain/user/user.entity';
import { ReadCapabilitiesUseCase } from '../../domain/user/use-cases/read-capabilities.usecase';
import { CapabilityReadState } from './capability-read-state';
import { UserCapabilitiesStore } from './user-capabilities.store';

const modules: readonly CapabilityModule[] = [
  { id: CapabilityModuleId.Catalog, state: CapabilityModuleState.Active, configVersion: 4 },
];

function createStore(listCapabilities: () => Observable<readonly CapabilityModule[]> = vi.fn(() => of(modules))) {
  const store = new UserCapabilitiesStore({ execute: listCapabilities } as unknown as ReadCapabilitiesUseCase);
  store.setActor({ id: 'actor-a', roles: [UserRole.Operator] });
  return { store, listCapabilities };
}

describe('UserCapabilitiesStore', () => {
  it('uses the read-only endpoint and accepts an empty authoritative snapshot', () => {
    const { store, listCapabilities } = createStore(vi.fn(() => of([])));
    store.loadCapabilities();
    expect(listCapabilities).toHaveBeenCalledTimes(1);
    expect(store.snapshot.hasSnapshot).toBe(true);
    expect(store.snapshot.readState).toBe(CapabilityReadState.Ready);
    expect(store.snapshot.policy.allowsMutation).toBe(false);
    store.ngOnDestroy();
  });

  it('preserves snapshot, query, filter and selection after a refresh error', () => {
    const list = vi.fn().mockReturnValueOnce(of(modules)).mockReturnValueOnce(throwError(() => new Error('offline')));
    const { store } = createStore(list);
    store.loadCapabilities();
    store.setQuery('catálogo');
    store.setFilter(CapabilityFilter.Active);
    store.selectModule(CapabilityModuleId.Catalog);
    store.loadCapabilities();
    expect(store.snapshot.modules).toEqual(modules);
    expect(store.snapshot.readState).toBe(CapabilityReadState.Stale);
    expect(store.snapshot.query).toBe('catálogo');
    expect(store.snapshot.filter).toBe(CapabilityFilter.Active);
    expect(store.snapshot.selectedModule).toBe(CapabilityModuleId.Catalog);
    store.clearFilters();
    expect(store.snapshot.query).toBe('');
    expect(store.snapshot.filter).toBe(CapabilityFilter.All);
    store.ngOnDestroy();
  });

  it.each([401, 403])('clears private snapshots on authorization failure %s', (status) => {
    const { store } = createStore(vi.fn().mockReturnValueOnce(of(modules))
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status }))));
    store.loadCapabilities();
    store.selectModule(CapabilityModuleId.Catalog);
    store.loadCapabilities();
    expect(store.snapshot.modules).toEqual([]);
    expect(store.snapshot.selectedModule).toBeNull();
    expect(store.snapshot.readState).toBe(CapabilityReadState.AccessDenied);
    store.ngOnDestroy();
  });

  it('isolates actor changes and rejects late responses', () => {
    const response = new Subject<readonly CapabilityModule[]>();
    const { store, listCapabilities } = createStore(vi.fn(() => response.asObservable()));
    store.setQuery('private');
    store.loadCapabilities();
    store.setActor({ id: 'actor-b', roles: [UserRole.Admin] });
    response.next(modules);
    expect(store.snapshot.modules).toEqual([]);
    expect(store.snapshot.query).toBe('');
    store.setActor({ id: 'actor-b', roles: [UserRole.Unknown] });
    store.loadCapabilities();
    expect(listCapabilities).toHaveBeenCalledTimes(1);
    expect(store.snapshot.readState).toBe(CapabilityReadState.AccessDenied);
    store.ngOnDestroy();
  });

  it('only lets the latest refresh replace state and exposes refreshing', () => {
    const old = new Subject<readonly CapabilityModule[]>();
    const latest = new Subject<readonly CapabilityModule[]>();
    const { store } = createStore(vi.fn().mockReturnValueOnce(of(modules)).mockReturnValueOnce(old).mockReturnValueOnce(latest));
    store.loadCapabilities();
    store.loadCapabilities();
    expect(store.snapshot.readState).toBe(CapabilityReadState.Refreshing);
    store.loadCapabilities();
    latest.next([]);
    old.next(modules);
    expect(store.snapshot.modules).toEqual([]);
    expect(store.snapshot.readState).toBe(CapabilityReadState.Ready);
    store.ngOnDestroy();
  });

  it('handles synchronous failures and closed read states', () => {
    const { store } = createStore(vi.fn(() => { throw new Error('bad snapshot'); }));
    store.loadCapabilities();
    expect(store.snapshot.readState).toBe(CapabilityReadState.Error);
    expect(CapabilityReadState.fromWire('READY')).toBe(CapabilityReadState.Ready);
    expect(CapabilityReadState.fromWire('ready')).toBe(CapabilityReadState.Unknown);
    store.ngOnDestroy();
  });
});
