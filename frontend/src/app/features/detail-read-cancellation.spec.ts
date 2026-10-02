import { Subject } from 'rxjs';
import { CustomerOrder, OrderStatus, PaymentStatus, ShipmentStatus } from '../domain/order/order.entity';
import { GetMyOrderUseCase } from '../domain/order/use-cases/get-my-order.usecase';
import { ProductDetail } from '../domain/catalog/product-detail.entity';
import { GetProductUseCase } from '../domain/catalog/use-cases/get-product.usecase';
import { GetHomeUseCase } from '../domain/catalog/use-cases/get-home.usecase';
import { SearchCatalogUseCase } from '../domain/catalog/use-cases/search-catalog.usecase';
import { ListCatalogFacetsUseCase } from '../domain/catalog/use-cases/list-catalog-facets.usecase';
import { CustomerOrderDetailStore } from './orders/customer-order-detail.store';
import { CatalogStore } from './storefront/catalog.store';

describe('detail reads across route identities', () => {
  it('keeps customer order B when the cancelled A read responds late', () => {
    const old = new Subject<CustomerOrder>();
    const current = new Subject<CustomerOrder>();
    const execute = vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(current);
    const store = new CustomerOrderDetailStore({ execute } as unknown as GetMyOrderUseCase);
    let displayed: CustomerOrder | null = null;
    const subscription = store.order$.subscribe((value) => { displayed = value; });
    const order = (id: string): CustomerOrder => ({ id, orderStatus: OrderStatus.Paid,
      paymentStatus: PaymentStatus.Approved, shipmentStatus: ShipmentStatus.Preparing,
      tracking: null, total: 0, lines: [] });
    store.load('A');
    store.load('B');
    current.next(order('B'));
    old.next(order('A'));
    expect(displayed).toEqual(order('B'));
    subscription.unsubscribe();
    store.ngOnDestroy();
  });

  it('clears the old product and never restores it after the new read fails', () => {
    const old = new Subject<ProductDetail>();
    const current = new Subject<ProductDetail>();
    const execute = vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(current);
    const store = new CatalogStore({} as SearchCatalogUseCase, {} as GetHomeUseCase,
      { execute } as unknown as GetProductUseCase, {} as ListCatalogFacetsUseCase);
    const product: ProductDetail = { sku: 'A', name: 'A', description: '', brand: '', category: '',
      images: [], variants: [], price: { base: 0, desired: null, observed: null, effective: 0, priceVersion: '1' },
      offerRef: null, active: true };
    store.loadProduct('A');
    old.next(product);
    expect(store.snapshot.product?.sku).toBe('A');
    store.loadProduct('B');
    expect(store.snapshot.product).toBeNull();
    old.next(product);
    current.error(new Error('B unavailable'));
    expect(store.snapshot.product).toBeNull();
    expect(store.snapshot.loading).toBe(false);
    expect(store.snapshot.errorMessage).not.toBe('');
    store.ngOnDestroy();
  });
});
