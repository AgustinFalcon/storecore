import { type DemoProduct } from '../demo-model';
import { CatalogStockScope, type DemoCatalogCriteria } from './demo-catalog-location';

/** Pure catalog projection. Angular, routing and mutations remain at the application boundary. */
export class DemoCatalogPresenter {
  constructor(readonly pageSize = 6) {}

  filter(
    products: readonly DemoProduct[],
    criteria: DemoCatalogCriteria,
    available: (product: DemoProduct) => number,
    effectivePrice: (product: DemoProduct) => number,
  ): DemoProduct[] {
    const search = criteria.search.trim().toLocaleLowerCase('es-AR');
    return products
      .filter(product => product.active
        && (!search || `${product.name} ${product.sku}`.toLocaleLowerCase('es-AR').includes(search))
        && (!criteria.category || product.category === criteria.category)
        && (!criteria.brand || product.brand === criteria.brand)
        && (criteria.stock !== CatalogStockScope.Available || available(product) > 0)
        && (criteria.maxPrice === null || effectivePrice(product) <= criteria.maxPrice * 100))
      .sort((left, right) => criteria.sort.compare(left, right, effectivePrice));
  }

  pageIndex(total: number, requested: number): number {
    if (total <= 0) return 0;
    return Math.min(Math.max(0, Math.trunc(requested)), Math.ceil(total / this.pageSize) - 1);
  }

  pageCount(total: number): number {
    return Math.max(1, Math.ceil(total / this.pageSize));
  }

  page(products: readonly DemoProduct[], requested: number): DemoProduct[] {
    const start = this.pageIndex(products.length, requested) * this.pageSize;
    return products.slice(start, start + this.pageSize);
  }
}
