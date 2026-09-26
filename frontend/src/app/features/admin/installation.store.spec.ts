import { of, Subject, throwError } from 'rxjs';
import { MercadoLibreAccount, MercadoLibreListing } from '../../domain/user/user.entity';
import { ManageInstallationUseCase } from '../../domain/user/use-cases/manage-installation.usecase';
import { InstallationStore } from './installation.store';

const account: MercadoLibreAccount = { authorized: true, accountRef: 'MLA-ACC', status: 'ACTIVE' };

describe('InstallationStore Mercado Libre listings', () => {
  it('starts unloaded so an initial empty array is not a completed load', () => {
    const store = new InstallationStore({} as ManageInstallationUseCase);

    expect(store.snapshot.listings).toBeNull();
    expect(store.snapshot.loading).toBe(false);
    expect(store.snapshot.errorMessage).toBe('');
    expect(store.snapshot.capabilities).toEqual([]);
    expect(store.snapshot.inventory).toEqual([]);
  });

  it('keeps listings unloaded until the request finishes, then stores a real empty array', () => {
    const listings = new Subject<readonly MercadoLibreListing[]>();
    const store = new InstallationStore({
      readMercadoLibreAccount: () => of(account),
      listMercadoLibreListings: () => listings.asObservable(),
    } as unknown as ManageInstallationUseCase);

    store.loadMercadoLibre();

    expect(store.snapshot.loading).toBe(true);
    expect(store.snapshot.listings).toBeNull();
    expect(store.snapshot.errorMessage).toBe('');

    listings.next([]);
    listings.complete();

    expect(store.snapshot.loading).toBe(false);
    expect(store.snapshot.errorMessage).toBe('');
    expect(store.snapshot.listings).toEqual([]);
    expect(store.snapshot.capabilities).toEqual([]);
    expect(store.snapshot.inventory).toEqual([]);
  });

  it('does not record an empty list when the load fails', () => {
    const store = new InstallationStore({
      readMercadoLibreAccount: () => of(account),
      listMercadoLibreListings: () => throwError(() => new Error('caido')),
    } as unknown as ManageInstallationUseCase);

    store.loadMercadoLibre();

    expect(store.snapshot.loading).toBe(false);
    expect(store.snapshot.listings).toBeNull();
    expect(store.snapshot.errorMessage).toBe('caido');
  });

  it('stores listings returned by a successful load', () => {
    const mapped: MercadoLibreListing = { listingId: 'MLA-1', variationId: '1', sku: 'SKU-1' };
    const store = new InstallationStore({
      readMercadoLibreAccount: () => of(account),
      listMercadoLibreListings: () => of([mapped]),
    } as unknown as ManageInstallationUseCase);

    store.loadMercadoLibre();

    expect(store.snapshot.listings).toEqual([mapped]);
    expect(store.snapshot.loading).toBe(false);
    expect(store.snapshot.errorMessage).toBe('');
  });
});
