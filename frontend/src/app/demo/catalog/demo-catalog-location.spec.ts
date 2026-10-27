import { CatalogSort } from '../demo-model';
import { CatalogStockScope, DemoCatalogLocation } from './demo-catalog-location';

describe('DemoCatalogLocation', () => {
  const location = new DemoCatalogLocation();
  const query = (values: Record<string, string>): { get(name: string): string | null } => ({ get: name => values[name] ?? null });

  it('round-trips supported public criteria and drops foreign values', () => {
    const parsed = location.fromQuery(query({ q: ' taladro ', category: 'Herramientas', brand: 'Norte', stock: 'available', max: '1200', sort: 'price-down', page: '3', foreign: 'discard' }));
    expect(parsed).toEqual({ search: 'taladro', category: 'Herramientas', brand: 'Norte', stock: CatalogStockScope.Available, maxPrice: 1200, sort: CatalogSort.PriceDown, page: 2 });
    expect(location.toQuery(parsed)).toEqual({ q: 'taladro', category: 'Herramientas', brand: 'Norte', stock: 'available', max: 1200, sort: 'price-down', page: 3 });
  });

  it('distinguishes an absent maximum from an explicit zero', () => {
    expect(location.fromQuery(query({})).maxPrice).toBeNull();
    expect(location.fromQuery(query({ max: '0' })).maxPrice).toBe(0);
  });

  it.each(['NaN', 'Infinity', '-1', ''])('recovers an invalid maximum %s as absent', raw => {
    expect(location.fromQuery(query({ max: raw })).maxPrice).toBeNull();
  });

  it.each(['0', '-2', '1.5', 'Infinity', 'NaN'])('bounds invalid page %s to the first page', raw => {
    expect(location.fromQuery(query({ page: raw })).page).toBe(0);
  });

  it('preserves unknown closed values without exposing their raw wire', () => {
    const parsed = location.fromQuery(query({ sort: 'future-sort', stock: 'future-stock' }));
    expect(parsed.sort).toBe(CatalogSort.Unknown);
    expect(parsed.stock).toBe(CatalogStockScope.Unknown);
    expect(location.toQuery(parsed)['sort']).toBeNull();
    expect(location.toQuery(parsed)['stock']).toBeNull();
  });
});
