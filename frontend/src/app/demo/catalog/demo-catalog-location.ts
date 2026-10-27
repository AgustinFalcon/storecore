import { CatalogSort } from '../demo-model';

export class CatalogStockScope {
  private constructor(readonly wire: string, readonly label: string, readonly availableOnly: boolean) {}

  static readonly All = new CatalogStockScope('', 'Todo el stock', false);
  static readonly Available = new CatalogStockScope('available', 'Con stock', true);
  static readonly Unknown = new CatalogStockScope('unknown', 'Disponibilidad desconocida', false);
  static readonly all = [this.All, this.Available] as const;

  static fromWire(raw: unknown): CatalogStockScope {
    if (raw === null || raw === undefined || raw === '') return this.All;
    return this.all.find(scope => scope.wire === raw) ?? this.Unknown;
  }
}

export interface DemoCatalogCriteria {
  readonly search: string;
  readonly category: string;
  readonly brand: string;
  readonly stock: CatalogStockScope;
  readonly maxPrice: number | null;
  readonly sort: CatalogSort;
  readonly page: number;
}

export interface CatalogQueryReader {
  get(name: string): string | null;
}

/** Sole URL wire translator for storefront catalog state. */
export class DemoCatalogLocation {
  fromQuery(query: CatalogQueryReader): DemoCatalogCriteria {
    const rawMaximum = query.get('max');
    const maximum = rawMaximum === null || rawMaximum.trim() === '' ? null : Number(rawMaximum);
    const rawPage = Number(query.get('page'));
    return {
      search: query.get('q')?.trim() ?? '',
      category: query.get('category') ?? '',
      brand: query.get('brand') ?? '',
      stock: CatalogStockScope.fromWire(query.get('stock')),
      maxPrice: maximum !== null && Number.isFinite(maximum) && maximum >= 0 ? maximum : null,
      sort: query.get('sort') === null ? CatalogSort.Featured : CatalogSort.fromWire(query.get('sort')),
      page: Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage - 1 : 0,
    };
  }

  toQuery(criteria: DemoCatalogCriteria): Record<string, string | number | null> {
    return {
      q: criteria.search || null,
      category: criteria.category || null,
      brand: criteria.brand || null,
      stock: criteria.stock === CatalogStockScope.Available ? criteria.stock.wire : null,
      max: criteria.maxPrice,
      sort: criteria.sort === CatalogSort.Featured || criteria.sort === CatalogSort.Unknown ? null : criteria.sort.wire,
      page: criteria.page > 0 ? criteria.page + 1 : null,
    };
  }
}
