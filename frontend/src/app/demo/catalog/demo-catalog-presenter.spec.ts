import { CatalogSort, demoSeed } from '../demo-model';
import { CatalogStockScope, type DemoCatalogCriteria } from './demo-catalog-location';
import { DemoCatalogPresenter } from './demo-catalog-presenter';

describe('DemoCatalogPresenter', () => {
  const presenter = new DemoCatalogPresenter(2);
  const criteria: DemoCatalogCriteria = { search: '', category: '', brand: '', stock: CatalogStockScope.All, maxPrice: null, sort: CatalogSort.Featured, page: 0 };

  it('filters archived products with typed criteria without mutating the source', () => {
    const products = demoSeed().products;
    const source = products.map(product => product.sku);
    const result = presenter.filter(products, { ...criteria, category: 'Seguridad', sort: CatalogSort.Name }, product => product.onHand, product => product.price);
    expect(result.every(product => product.category === 'Seguridad' && product.active)).toBe(true);
    expect(products.map(product => product.sku)).toEqual(source);
  });

  it('uses effective prices and explicit zero maximums', () => {
    const products = demoSeed().products.slice(0, 3);
    const prices = new Map(products.map((product, index) => [product.sku, index === 2 ? 0 : product.price]));
    const result = presenter.filter(products, { ...criteria, maxPrice: 0, sort: CatalogSort.PriceUp }, product => product.onHand, product => prices.get(product.sku)!);
    expect(result.map(product => product.sku)).toEqual([products[2].sku]);
  });

  it('supports closed stock filtering', () => {
    const products = demoSeed().products.slice(0, 2);
    expect(presenter.filter(products, { ...criteria, stock: CatalogStockScope.Available }, product => product === products[0] ? 1 : 0, product => product.price)).toEqual([products[0]]);
  });

  it('bounds negative and excessive pages and handles an empty collection', () => {
    const products = demoSeed().products.slice(0, 5);
    expect(presenter.page(products, -9)).toEqual(products.slice(0, 2));
    expect(presenter.page(products, 999)).toEqual(products.slice(4, 5));
    expect(presenter.page([], 999)).toEqual([]);
    expect(presenter.pageCount(0)).toBe(1);
  });
});
