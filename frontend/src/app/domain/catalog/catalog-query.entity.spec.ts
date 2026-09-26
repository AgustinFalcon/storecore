import { catalogQueryFromParams, catalogQueryParams, sameCatalogQuery } from './catalog-query.entity';

describe('catalogQueryParams', () => {
  it('keeps an offers-only link and drops empty filters', () => {
    expect(
      catalogQueryParams({ query: '  ', brand: '', category: '12', offersOnly: true }),
    ).toEqual({
      q: null,
      brand: null,
      category: '12',
      offers: '1',
    });
  });

  it('clears the offers flag when the search is not offers-only', () => {
    expect(
      catalogQueryParams({ query: 'lampara', brand: '3', category: '', offersOnly: false }),
    ).toEqual({
      q: 'lampara',
      brand: '3',
      category: null,
      offers: null,
    });
  });

  it('reads the home link and ignores any offers flag other than 1', () => {
    expect(
      catalogQueryFromParams({
        get: (name) => ({ q: '  foco ', brand: ' osram ', category: ' luz ', offers: '1' })[name] ?? null,
      }),
    ).toEqual({
      query: 'foco',
      brand: 'osram',
      category: 'luz',
      offersOnly: true,
    });
    expect(
      catalogQueryFromParams({
        get: (name) => (name === 'offers' ? 'true' : null),
      }).offersOnly,
    ).toBe(false);
  });

  it('round-trips a catalog link', () => {
    const parsed = catalogQueryFromParams({
      get: (name) => ({ q: 'foco', category: 'luz', offers: '1' })[name] ?? null,
    });
    expect(catalogQueryParams(parsed)).toEqual({
      q: 'foco',
      brand: null,
      category: 'luz',
      offers: '1',
    });
    expect(sameCatalogQuery(parsed, { ...parsed, query: ' foco ' })).toBe(true);
  });
});
