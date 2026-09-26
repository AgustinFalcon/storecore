export interface CatalogQuery {
  readonly query: string;
  readonly brand: string;
  readonly category: string;
  readonly offersOnly: boolean;
}

export const emptyCatalogQuery: CatalogQuery = {
  query: '',
  brand: '',
  category: '',
  offersOnly: false,
};

/** Query string for `/catalog`. Empty fields are omitted so the home links stay readable. */
export function catalogQueryParams(query: CatalogQuery): Record<string, string | null> {
  const normalized = normalizeCatalogQuery(query);
  return {
    q: normalized.query || null,
    brand: normalized.brand || null,
    category: normalized.category || null,
    offers: normalized.offersOnly ? '1' : null,
  };
}

/** Reads the storefront query string. Only `offers=1` means offers-only. */
export function catalogQueryFromParams(params: { get(name: string): string | null }): CatalogQuery {
  return normalizeCatalogQuery({
    query: params.get('q') ?? '',
    brand: params.get('brand') ?? '',
    category: params.get('category') ?? '',
    offersOnly: params.get('offers') === '1',
  });
}

export function normalizeCatalogQuery(query: CatalogQuery): CatalogQuery {
  return {
    query: query.query.trim(),
    brand: query.brand.trim(),
    category: query.category.trim(),
    offersOnly: query.offersOnly,
  };
}

export function sameCatalogQuery(left: CatalogQuery, right: CatalogQuery): boolean {
  const a = normalizeCatalogQuery(left);
  const b = normalizeCatalogQuery(right);
  return a.query === b.query && a.brand === b.brand && a.category === b.category && a.offersOnly === b.offersOnly;
}
