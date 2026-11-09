import { channelAccountFixture, channelListingFixture } from '../../data/user/channel-pricing.spec-fixtures';
import { BoundedRows } from '../../domain/catalog/bounded-rows';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, Subject, throwError } from 'rxjs';
import { UserRole } from '../../domain/user/user-role';
import { MercadoLibreAccount, MercadoLibreListing } from '../../domain/user/user.entity';
import { ManageInstallationUseCase } from '../../domain/user/use-cases/manage-installation.usecase';
import { MercadoLibreReadPhase } from './mercadolibre-read-phase';
import { UserMercadoLibreStore } from './user-mercadolibre.store';

const account: MercadoLibreAccount = channelAccountFixture();
const listings = Object.assign([channelListingFixture()], { metadata: { page: 0, total: 1, size: 25, truncated: false } });
const emptyListings = Object.assign([], { metadata: { page: 0, total: 0, size: 25, truncated: false } });

function createStore(
  readAccount: () => Observable<MercadoLibreAccount> = vi.fn(() => of(account)),
  readListings: () => Observable<BoundedRows<MercadoLibreListing>> = vi.fn(() => of(listings)),
) {
  const store = new UserMercadoLibreStore({
    readMercadoLibreAccount: readAccount,
    listMercadoLibreListings: readListings,
  } as unknown as ManageInstallationUseCase);
  store.setActor({ id: 'actor-a', roles: [UserRole.Admin] });
  return { store, readAccount, readListings };
}

describe('UserMercadoLibreStore', () => {
  it('bounds navigation, blocks concurrent paging, and publishes page identity only with its snapshot', () => {
    const firstPage = Object.assign([...listings], { metadata: { page: 0, size: 25, total: 26, truncated: true } });
    const secondPage = new Subject<BoundedRows<MercadoLibreListing>>();
    const readListings = vi.fn().mockReturnValueOnce(of(firstPage)).mockReturnValueOnce(secondPage);
    const { store } = createStore(undefined, readListings); store.loadMercadoLibre();
    for (const page of [-1, 0, 2, 10001, .5]) store.goToPage(page);
    expect(readListings).toHaveBeenCalledTimes(1);
    store.setQuery('page-local'); store.goToPage(1);
    expect(readListings).toHaveBeenLastCalledWith(1); expect(store.snapshot.query).toBe('');
    expect(store.snapshot.page).toBe(0); expect(store.snapshot.listings).toBe(firstPage);
    store.goToPage(0); store.goToPage(1); expect(readListings).toHaveBeenCalledTimes(2);
    const lastPage = Object.assign([...listings], { metadata: { page: 1, size: 25, total: 26, truncated: true } });
    secondPage.next(lastPage); secondPage.complete();
    expect(store.snapshot.page).toBe(1); expect(store.snapshot.listings).toBe(lastPage); store.ngOnDestroy();
  });
  it('performs only the two existing GET reads and accepts an empty coherent snapshot', () => {
    const disconnected: MercadoLibreAccount = channelAccountFixture({ accountRef: null, availability: 'UNAVAILABLE', reason: 'EXTERNAL_NOT_AVAILABLE', status: 'DISABLED', updatedAt: null });
    const { store, readAccount, readListings } = createStore(vi.fn(() => of(disconnected)), vi.fn(() => of(emptyListings)));
    store.loadMercadoLibre();
    expect(readAccount).toHaveBeenCalledTimes(1);
    expect(readListings).toHaveBeenCalledTimes(1);
    expect(store.snapshot.hasSnapshot).toBe(true);
    expect(store.snapshot.readPhase).toBe(MercadoLibreReadPhase.Ready);
    expect(store.snapshot.listings).toHaveLength(0);
    store.ngOnDestroy();
  });

  it('publishes account and listings atomically only after both reads complete', () => {
    const accountRead = new Subject<MercadoLibreAccount>();
    const listingsRead = new Subject<BoundedRows<MercadoLibreListing>>();
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
    const readListings = vi.fn().mockReturnValueOnce(of(listings)).mockReturnValueOnce(of(emptyListings)).mockReturnValueOnce(of(emptyListings));
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
    expect(store.snapshot.listings).toHaveLength(0);
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
    expect(store.snapshot.listings).toHaveLength(0);
    expect(store.snapshot.query).toBe('');
    expect(store.snapshot.hasSnapshot).toBe(false);
    expect(store.snapshot.readPhase).toBe(MercadoLibreReadPhase.AccessDenied);
    store.ngOnDestroy();
  });

  it('invalidates late reads and private UI state when the actor changes or logs out', () => {
    const accountRead = new Subject<MercadoLibreAccount>();
    const listingsRead = new Subject<BoundedRows<MercadoLibreListing>>();
    const readAccount = vi.fn(() => accountRead);
    const { store } = createStore(readAccount, () => listingsRead);
    store.setQuery('private');
    store.loadMercadoLibre();
    expect(store.setActor({ id: 'actor-b', roles: [UserRole.Admin] })).toBe(true);
    accountRead.next(account); accountRead.complete();
    listingsRead.next(listings); listingsRead.complete();
    expect(store.snapshot.account).toBeNull();
    expect(store.snapshot.listings).toHaveLength(0);
    expect(store.snapshot.query).toBe('');
    store.setActor(null);
    store.loadMercadoLibre();
    expect(readAccount).toHaveBeenCalledTimes(1);
    expect(store.snapshot.readPhase).toBe(MercadoLibreReadPhase.AccessDenied);
    store.ngOnDestroy();
  });

  it('blocks unknown roles and reports stable actor identities without duplicate resets', () => {
    const { store, readAccount } = createStore();
    expect(store.setActor({ id: 'actor-a', roles: [UserRole.Admin] })).toBe(false);
    expect(store.setActor({ id: 'actor-a', roles: [UserRole.Admin] })).toBe(false);
    expect(store.setActor({ id: 'actor-a', roles: [UserRole.Unknown] })).toBe(true);
    store.loadMercadoLibre();
    expect(readAccount).not.toHaveBeenCalled();
    expect(store.snapshot.readPhase).toBe(MercadoLibreReadPhase.AccessDenied);
    store.ngOnDestroy();
  });

  it('lets only the latest combined refresh replace state', () => {
    const oldAccount = new Subject<MercadoLibreAccount>();
    const oldListings = new Subject<BoundedRows<MercadoLibreListing>>();
    const newAccount = new Subject<MercadoLibreAccount>();
    const newListings = new Subject<BoundedRows<MercadoLibreListing>>();
    const { store } = createStore(
      vi.fn().mockReturnValueOnce(oldAccount).mockReturnValueOnce(newAccount),
      vi.fn().mockReturnValueOnce(oldListings).mockReturnValueOnce(newListings),
    );
    store.loadMercadoLibre();
    store.loadMercadoLibre();
    newAccount.next(account); newAccount.complete();
    newListings.next(listings); newListings.complete();
    oldAccount.next({ ...account, accountRef: 'old' }); oldAccount.complete();
    oldListings.next(emptyListings); oldListings.complete();
    expect(store.snapshot.account).toBe(account);
    expect(store.snapshot.listings).toBe(listings);
    store.ngOnDestroy();
  });

  it('represents an in-flight refresh while retaining the previous snapshot', () => {
    const refreshAccount = new Subject<MercadoLibreAccount>();
    const refreshListings = new Subject<BoundedRows<MercadoLibreListing>>();
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
