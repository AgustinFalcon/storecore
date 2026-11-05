import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, Subject, throwError } from 'rxjs';
import { MercadoLibreAccountStatus } from '../../domain/user/mercadolibre-account-status';
import { UserRole } from '../../domain/user/user-role';
import { MercadoLibreAccount, MercadoLibreListing } from '../../domain/user/user.entity';
import { ManageInstallationUseCase } from '../../domain/user/use-cases/manage-installation.usecase';
import { MercadoLibreReadPhase } from './mercadolibre-read-phase';
import { UserMercadoLibreStore } from './user-mercadolibre.store';

const account: MercadoLibreAccount = { authorized: true, accountRef: 'seller-1', status: MercadoLibreAccountStatus.Active };
const listings: readonly MercadoLibreListing[] = [{ listingId: 'MLA-1', variationId: '', sku: 'SKU-1' }];

function createStore(
  readAccount: () => Observable<MercadoLibreAccount> = vi.fn(() => of(account)),
  readListings: () => Observable<readonly MercadoLibreListing[]> = vi.fn(() => of(listings)),
) {
  const store = new UserMercadoLibreStore({
    readMercadoLibreAccount: readAccount,
    listMercadoLibreListings: readListings,
  } as unknown as ManageInstallationUseCase);
  store.setActor({ id: 'actor-a', roles: [UserRole.Operator] });
  return { store, readAccount, readListings };
}

describe('UserMercadoLibreStore', () => {
  it('performs only the two existing GET reads and accepts an empty coherent snapshot', () => {
    const disconnected: MercadoLibreAccount = { authorized: false, accountRef: '', status: MercadoLibreAccountStatus.Disabled };
    const { store, readAccount, readListings } = createStore(vi.fn(() => of(disconnected)), vi.fn(() => of([])));
    store.loadMercadoLibre();
    expect(readAccount).toHaveBeenCalledTimes(1);
    expect(readListings).toHaveBeenCalledTimes(1);
    expect(store.snapshot.hasSnapshot).toBe(true);
    expect(store.snapshot.readPhase).toBe(MercadoLibreReadPhase.Ready);
    expect(store.snapshot.listings).toEqual([]);
    store.ngOnDestroy();
  });

  it('publishes account and listings atomically only after both reads complete', () => {
    const accountRead = new Subject<MercadoLibreAccount>();
    const listingsRead = new Subject<readonly MercadoLibreListing[]>();
    const { store } = createStore(() => accountRead, () => listingsRead);
    store.loadMercadoLibre();
    accountRead.next(account);
    accountRead.complete();
    expect(store.snapshot.account).toBeNull();
    expect(store.snapshot.hasSnapshot).toBe(false);
    expect(store.snapshot.readPhase).toBe(MercadoLibreReadPhase.Loading);
    listingsRead.next(listings);
    listingsRead.complete();
    expect(store.snapshot.account).toBe(account);
    expect(store.snapshot.listings).toBe(listings);
    expect(store.snapshot.readPhase).toBe(MercadoLibreReadPhase.Ready);
    store.ngOnDestroy();
  });

  it('preserves the last complete snapshot and query after a refresh failure, then recovers', () => {
    const readAccount = vi.fn().mockReturnValueOnce(of(account)).mockReturnValueOnce(throwError(() => new Error('offline'))).mockReturnValueOnce(of(account));
    const readListings = vi.fn().mockReturnValueOnce(of(listings)).mockReturnValueOnce(of([])).mockReturnValueOnce(of([]));
    const { store } = createStore(readAccount, readListings);
    store.loadMercadoLibre();
    store.setQuery('SKU-1');
    store.loadMercadoLibre();
    expect(store.snapshot.account).toBe(account);
    expect(store.snapshot.listings).toBe(listings);
    expect(store.snapshot.query).toBe('SKU-1');
    expect(store.snapshot.readPhase).toBe(MercadoLibreReadPhase.Stale);
    expect(store.snapshot.errorMessage).toBe('offline');
    store.loadMercadoLibre();
    expect(store.snapshot.listings).toEqual([]);
    expect(store.snapshot.readPhase).toBe(MercadoLibreReadPhase.Ready);
    expect(store.snapshot.errorMessage).toBe('');
    store.clearQuery();
    expect(store.snapshot.query).toBe('');
    store.ngOnDestroy();
  });

  it('distinguishes synchronous initial failure from stale data', () => {
    const { store } = createStore(() => { throw new Error('bad account'); });
    store.loadMercadoLibre();
    expect(store.snapshot.loading).toBe(false);
    expect(store.snapshot.hasSnapshot).toBe(false);
    expect(store.snapshot.readPhase).toBe(MercadoLibreReadPhase.Error);
    expect(store.snapshot.errorMessage).toBe('bad account');
    store.ngOnDestroy();
  });

  it.each([401, 403])('clears private account and listings on authorization failure %s', (status) => {
    const readAccount = vi.fn().mockReturnValueOnce(of(account)).mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status })));
    const { store } = createStore(readAccount);
    store.loadMercadoLibre();
    store.setQuery('private');
    store.loadMercadoLibre();
    expect(store.snapshot.account).toBeNull();
    expect(store.snapshot.listings).toEqual([]);
    expect(store.snapshot.query).toBe('');
    expect(store.snapshot.hasSnapshot).toBe(false);
    expect(store.snapshot.readPhase).toBe(MercadoLibreReadPhase.AccessDenied);
    store.ngOnDestroy();
  });

  it('invalidates late reads and private UI state when the actor changes or logs out', () => {
    const accountRead = new Subject<MercadoLibreAccount>();
    const listingsRead = new Subject<readonly MercadoLibreListing[]>();
    const readAccount = vi.fn(() => accountRead);
    const { store } = createStore(readAccount, () => listingsRead);
    store.setQuery('private');
    store.loadMercadoLibre();
    expect(store.setActor({ id: 'actor-b', roles: [UserRole.Admin] })).toBe(true);
    accountRead.next(account); accountRead.complete();
    listingsRead.next(listings); listingsRead.complete();
    expect(store.snapshot.account).toBeNull();
    expect(store.snapshot.listings).toEqual([]);
    expect(store.snapshot.query).toBe('');
    store.setActor(null);
    store.loadMercadoLibre();
    expect(readAccount).toHaveBeenCalledTimes(1);
    expect(store.snapshot.readPhase).toBe(MercadoLibreReadPhase.AccessDenied);
    store.ngOnDestroy();
  });

  it('blocks unknown roles and reports stable actor identities without duplicate resets', () => {
    const { store, readAccount } = createStore();
    expect(store.setActor({ id: 'actor-a', roles: [UserRole.Operator] })).toBe(false);
    expect(store.setActor({ id: 'actor-a', roles: [UserRole.Operator] })).toBe(false);
    expect(store.setActor({ id: 'actor-a', roles: [UserRole.Unknown] })).toBe(true);
    store.loadMercadoLibre();
    expect(readAccount).not.toHaveBeenCalled();
    expect(store.snapshot.readPhase).toBe(MercadoLibreReadPhase.AccessDenied);
    store.ngOnDestroy();
  });

  it('lets only the latest combined refresh replace state', () => {
    const oldAccount = new Subject<MercadoLibreAccount>();
    const oldListings = new Subject<readonly MercadoLibreListing[]>();
    const newAccount = new Subject<MercadoLibreAccount>();
    const newListings = new Subject<readonly MercadoLibreListing[]>();
    const { store } = createStore(
      vi.fn().mockReturnValueOnce(oldAccount).mockReturnValueOnce(newAccount),
      vi.fn().mockReturnValueOnce(oldListings).mockReturnValueOnce(newListings),
    );
    store.loadMercadoLibre();
    store.loadMercadoLibre();
    newAccount.next(account); newAccount.complete();
    newListings.next(listings); newListings.complete();
    oldAccount.next({ ...account, accountRef: 'old' }); oldAccount.complete();
    oldListings.next([]); oldListings.complete();
    expect(store.snapshot.account).toBe(account);
    expect(store.snapshot.listings).toBe(listings);
    store.ngOnDestroy();
  });

  it('represents an in-flight refresh while retaining the previous snapshot', () => {
    const refreshAccount = new Subject<MercadoLibreAccount>();
    const refreshListings = new Subject<readonly MercadoLibreListing[]>();
    const { store } = createStore(
      vi.fn().mockReturnValueOnce(of(account)).mockReturnValueOnce(refreshAccount),
      vi.fn().mockReturnValueOnce(of(listings)).mockReturnValueOnce(refreshListings),
    );
    store.loadMercadoLibre();
    store.loadMercadoLibre();
    expect(store.snapshot.readPhase).toBe(MercadoLibreReadPhase.Refreshing);
    expect(store.snapshot.account).toBe(account);
    expect(store.snapshot.listings).toBe(listings);
    store.ngOnDestroy();
  });
});
