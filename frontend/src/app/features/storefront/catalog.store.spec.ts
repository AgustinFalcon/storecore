import { of } from 'rxjs';
import { ProductDetail } from '../../domain/catalog/product-detail.entity';
import { ProductSummary } from '../../domain/catalog/product-summary.entity';
import { GetHomeUseCase } from '../../domain/catalog/use-cases/get-home.usecase';
import { GetProductUseCase } from '../../domain/catalog/use-cases/get-product.usecase';
import { ListCatalogFacetsUseCase } from '../../domain/catalog/use-cases/list-catalog-facets.usecase';
import { SearchCatalogUseCase } from '../../domain/catalog/use-cases/search-catalog.usecase';
import { CatalogStore } from './catalog.store';

const past = { validFrom: '2000-01-01T00:00:00.000Z', validUntil: '2000-01-02T00:00:00.000Z' };
const future = { validFrom: '2099-01-01T00:00:00.000Z', validUntil: '2099-01-02T00:00:00.000Z' };
const open = { validFrom: '2000-01-01T00:00:00.000Z', validUntil: '2099-01-01T00:00:00.000Z' };

describe('CatalogStore offer window', () => {
  it('clears the grid badge outside the window and keeps the numeric price', () => {
    const closed = summary({ sku: 'PAST', ...past });
    const later = summary({ sku: 'FUTURE', ...future });
    const current = summary({ sku: 'OPEN', ...open });
    const unmarked = summary({ sku: 'PLAIN', offerRef: 'O-2' });
    const oneBound = summary({ sku: 'FROM', offerRef: 'O-3', validFrom: past.validFrom });
    const store = createStore([closed, later, current, unmarked, oneBound], detail());

    store.search();

    const products = store.snapshot.products;
    expect(products.map((product) => product.sku)).toEqual(['PAST', 'FUTURE', 'OPEN', 'PLAIN', 'FROM']);
    expect(products[0].offerRef).toBeNull();
    expect(products[1].offerRef).toBeNull();
    expect(products[2].offerRef).toBe('O-1');
    expect(products[3].offerRef).toBe('O-2');
    expect(products[3].validFrom).toBeUndefined();
    expect(products[4].offerRef).toBe('O-3');
    for (const product of products) {
      expect(product.price).toBe(80);
      expect(product.originalPrice).toBe(100);
    }
    expect(closed.offerRef).toBe('O-1');
  });

  it('clears the detail badge outside the window and keeps price.effective', () => {
    const source = detail(past);
    const store = createStore([], source);

    store.loadProduct('SKU-1');

    const product = store.snapshot.product;
    expect(product?.offerRef).toBeNull();
    expect(product?.price.effective).toBe(80);
    expect(product?.price.base).toBe(100);
    expect(product?.validFrom).toBe(past.validFrom);
    expect(product?.validUntil).toBe(past.validUntil);
    expect(source.offerRef).toBe('O-1');
    expect(source.price.effective).toBe(80);
  });

  it('keeps the detail offer inside the window and when the payload has no window', () => {
    const openStore = createStore([], detail(open));
    openStore.loadProduct('SKU-1');
    expect(openStore.snapshot.product?.offerRef).toBe('O-1');
    expect(openStore.snapshot.product?.price.effective).toBe(80);

    const plainStore = createStore([], detail());
    plainStore.loadProduct('SKU-1');
    expect(plainStore.snapshot.product?.offerRef).toBe('O-1');
    expect(plainStore.snapshot.product?.validFrom).toBeUndefined();
    expect(plainStore.snapshot.product?.validUntil).toBeUndefined();
    expect(plainStore.snapshot.product?.price.effective).toBe(80);
  });
});

function summary(partial: Partial<ProductSummary> & Pick<ProductSummary, 'sku'>): ProductSummary {
  return {
    name: 'Lámpara',
    price: 80,
    originalPrice: 100,
    imageUrl: null,
    offerRef: 'O-1',
    ...partial,
  };
}

function detail(window?: { validFrom: string; validUntil: string }): ProductDetail {
  return {
    sku: 'SKU-1',
    name: 'Lámpara',
    description: '',
    brand: '',
    category: '',
    images: [],
    variants: [],
    price: { base: 100, desired: null, observed: null, effective: 80, priceVersion: 'v1' },
    offerRef: 'O-1',
    ...(window ?? {}),
    active: true,
  };
}

function createStore(products: readonly ProductSummary[], product: ProductDetail): CatalogStore {
  return new CatalogStore(
    { execute: () => of(products) } as unknown as SearchCatalogUseCase,
    { execute: () => of({ title: '', blocks: [] }) } as unknown as GetHomeUseCase,
    { execute: () => of(product) } as unknown as GetProductUseCase,
    { execute: () => of({ brands: [], categories: [] }) } as unknown as ListCatalogFacetsUseCase,
  );
}
