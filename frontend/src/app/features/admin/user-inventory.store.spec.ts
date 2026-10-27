import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, Subject, throwError } from 'rxjs';
import { InventoryAvailability } from '../../domain/user/inventory-availability';
import { InventoryFilter } from '../../domain/user/inventory-filter';
import { UserRole } from '../../domain/user/user-role';
import { InventoryRow } from '../../domain/user/user.entity';
import { ManageInstallationUseCase } from '../../domain/user/use-cases/manage-installation.usecase';
import { InventoryReadState } from './user-inventory-read-state';
import { UserInventoryStore } from './user-inventory.store';

const rows: readonly InventoryRow[] = [{ sku: 'SKU', availableQuantity: 8, reservedQuantity: 3, safetyStock: 1, availability: InventoryAvailability.Normal }];

function createStore(listInventory: () => Observable<readonly InventoryRow[]> = vi.fn(() => of(rows))) {
  const store = new UserInventoryStore({ listInventory } as unknown as ManageInstallationUseCase);
  store.setActor({ id: 'actor-a', roles: [UserRole.Operator] });
  return { store, listInventory };
}

describe('UserInventoryStore', () => {
  it('reads only inventory and treats an empty successful response as a snapshot', () => {
    const { store, listInventory } = createStore(vi.fn(() => of([])));
    store.loadInventory();
    expect(listInventory).toHaveBeenCalledTimes(1);
    expect(store.snapshot.readState).toBe(InventoryReadState.Ready);
    expect(store.snapshot.hasSnapshot).toBe(true);
    expect(store.snapshot.rows).toEqual([]);
    store.ngOnDestroy();
  });

  it('preserves the previous snapshot and filters after refresh failure, then recovers', () => {
    const list = vi.fn().mockReturnValueOnce(of(rows)).mockReturnValueOnce(throwError(() => new Error('offline'))).mockReturnValueOnce(of([]));
    const { store } = createStore(list);
    store.loadInventory();
    store.setQuery('SKU');
    store.setFilter(InventoryFilter.Low);
    store.loadInventory();
    expect(store.snapshot.rows).toEqual(rows);
    expect(store.snapshot.readState).toBe(InventoryReadState.Stale);
    expect(store.snapshot.errorMessage).toBe('offline');
    expect(store.snapshot.query).toBe('SKU');
    expect(store.snapshot.filter).toBe(InventoryFilter.Low);
    store.loadInventory();
    expect(store.snapshot.readState).toBe(InventoryReadState.Ready);
    expect(store.snapshot.errorMessage).toBe('');
    store.clearFilters();
    expect(store.snapshot.filter).toBe(InventoryFilter.All);
    expect(store.snapshot.query).toBe('');
    store.ngOnDestroy();
  });

  it('separates initial read failure from stale data and handles synchronous failures', () => {
    const { store } = createStore(vi.fn(() => { throw new Error('bad snapshot'); }));
    store.loadInventory();
    expect(store.snapshot.readState).toBe(InventoryReadState.Error);
    expect(store.snapshot.loading).toBe(false);
    expect(store.snapshot.hasSnapshot).toBe(false);
    store.ngOnDestroy();
  });

  it.each([401, 403])('removes private snapshots on authorization failure %s', (status) => {
    const { store } = createStore(vi.fn().mockReturnValueOnce(of(rows)).mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status }))));
    store.loadInventory();
    store.loadInventory();
    expect(store.snapshot.readState).toBe(InventoryReadState.AccessDenied);
    expect(store.snapshot.rows).toEqual([]);
    expect(store.snapshot.hasSnapshot).toBe(false);
    store.ngOnDestroy();
  });

  it('clears actor state and rejects late success/error after a principal or role change', () => {
    for (const failure of [false, true]) {
      const response = new Subject<readonly InventoryRow[]>();
      const { store } = createStore(vi.fn(() => response.asObservable()));
      store.setQuery('private');
      store.setFilter(InventoryFilter.Out);
      store.loadInventory();
      store.setActor({ id: 'actor-b', roles: [UserRole.Admin] });
      if (failure) response.error(new Error('old request'));
      else response.next(rows);
      expect(store.snapshot.rows).toEqual([]);
      expect(store.snapshot.query).toBe('');
      expect(store.snapshot.filter).toBe(InventoryFilter.All);
      expect(store.snapshot.errorMessage).toBe('');
      expect(store.snapshot.loading).toBe(false);
      store.setActor({ id: 'actor-b', roles: [UserRole.Unknown] });
      store.loadInventory();
      expect(store.snapshot.readState).toBe(InventoryReadState.AccessDenied);
      store.ngOnDestroy();
    }
  });

  it('blocks unknown/absent actors and invalidates pending reads on logout', () => {
    const response = new Subject<readonly InventoryRow[]>();
    const { store, listInventory } = createStore(vi.fn(() => response.asObservable()));
    store.loadInventory();
    store.setActor(null);
    response.next(rows);
    store.loadInventory();
    expect(listInventory).toHaveBeenCalledTimes(1);
    expect(store.snapshot.rows).toEqual([]);
    expect(store.snapshot.readState).toBe(InventoryReadState.AccessDenied);
    store.ngOnDestroy();
  });

  it('reports actor changes so the component does not duplicate reads during session rehydration', () => {
    const { store } = createStore();
    const principal = { id: 'actor-a', roles: [UserRole.Operator] };
    expect(store.setActor(principal)).toBe(false);
    expect(store.setActor({ id: 'actor-a', roles: [UserRole.Operator] })).toBe(false);
    expect(store.setActor({ id: 'actor-b', roles: [UserRole.Admin] })).toBe(true);
    expect(store.setActor(null)).toBe(true);
    expect(store.setActor(null)).toBe(false);
    store.ngOnDestroy();
  });

  it('lets only the latest refresh replace state', () => {
    const old = new Subject<readonly InventoryRow[]>();
    const latest = new Subject<readonly InventoryRow[]>();
    const { store } = createStore(vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(latest));
    store.loadInventory();
    store.loadInventory();
    latest.next(rows);
    old.next([]);
    expect(store.snapshot.rows).toEqual(rows);
    expect(store.snapshot.readState).toBe(InventoryReadState.Ready);
    store.ngOnDestroy();
  });

  it('represents an in-flight refresh with its closed read state while retaining the snapshot', () => {
    const refresh = new Subject<readonly InventoryRow[]>();
    const { store } = createStore(vi.fn().mockReturnValueOnce(of(rows)).mockReturnValueOnce(refresh));
    store.loadInventory();
    store.loadInventory();
    expect(store.snapshot.readState).toBe(InventoryReadState.Refreshing);
    expect(store.snapshot.rows).toEqual(rows);
    expect(store.snapshot.hasSnapshot).toBe(true);
    refresh.next(rows);
    expect(store.snapshot.readState).toBe(InventoryReadState.Ready);
    store.ngOnDestroy();
  });

  it('decodes read states fail closed and owns their presentation', () => {
    for (const state of [InventoryReadState.Idle, InventoryReadState.Loading, InventoryReadState.Refreshing, InventoryReadState.Ready, InventoryReadState.Stale, InventoryReadState.Error, InventoryReadState.AccessDenied, InventoryReadState.Unknown]) {
      expect(InventoryReadState.fromWire(state.wire)).toBe(state);
      expect(state.label.length).toBeGreaterThan(0);
    }
    expect(InventoryReadState.fromWire(null)).toBe(InventoryReadState.Unknown);
    expect(InventoryReadState.fromWire('ready')).toBe(InventoryReadState.Unknown);
  });
});
