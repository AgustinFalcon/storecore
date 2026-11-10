import { of, throwError } from 'rxjs';
import { ListCatalogFacetsUseCase } from '../../domain/catalog/use-cases/list-catalog-facets.usecase';
import { GetHealthUseCase } from '../../domain/health/use-cases/get-health.usecase';
import { ShellStore } from './shell.store';
import { HealthStatus } from '../../domain/health/health-status';

function createStore(getHealth: Pick<GetHealthUseCase, 'execute'>): ShellStore {
  const listFacets = {
    execute: () => of({ brands: [], categories: [] }),
  } as Pick<ListCatalogFacetsUseCase, 'execute'>;
  return new ShellStore(getHealth as GetHealthUseCase, listFacets as ListCatalogFacetsUseCase);
}

describe('ShellStore', () => {
  it('closes loading and marks empty after a successful health read', () => {
    const getHealth = { execute: () => of({ status: HealthStatus.Up }) } as Pick<GetHealthUseCase, 'execute'>;
    const store = createStore(getHealth);

    store.loadHealth();

    expect(store.snapshot).toEqual({
      loading: false,
      ready: true,
      empty: true,
      errorMessage: '',
      apiStatus: HealthStatus.Up,
      categories: [],
    });
  });

  it('fails closed when a successful response contains an unknown health state', () => {
    const getHealth = { execute: () => of({ status: HealthStatus.Unknown }) } as Pick<GetHealthUseCase, 'execute'>;
    const store = createStore(getHealth);

    store.loadHealth();

    expect(store.snapshot.ready).toBe(false);
    expect(store.snapshot.apiStatus).toBe(HealthStatus.Unknown);
    expect(store.snapshot.errorMessage).toBe(HealthStatus.Unknown.label);
  });

  it('closes loading and keeps empty after a failed health read', () => {
    const getHealth = {
      execute: () => throwError(() => new Error('down')),
    } as Pick<GetHealthUseCase, 'execute'>;
    const store = createStore(getHealth);

    store.loadHealth();

    expect(store.snapshot.loading).toBe(false);
    expect(store.snapshot.ready).toBe(false);
    expect(store.snapshot.empty).toBe(true);
    expect(store.snapshot.errorMessage).toBe('down');
    expect(store.snapshot.apiStatus).toBe(HealthStatus.Unknown);
  });
});
