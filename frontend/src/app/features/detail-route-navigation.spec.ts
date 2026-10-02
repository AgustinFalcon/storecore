import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, of } from 'rxjs';
import { CartStore } from './cart/cart.store';
import { CheckoutResultComponent } from './cart/checkout-result.component';
import { CustomerOrderDetailComponent } from './orders/customer-order-detail.component';
import { CustomerOrderDetailStore } from './orders/customer-order-detail.store';
import { UserOrderDetailComponent } from './admin/user-order-detail.component';
import { UserOrderDetailStore } from './admin/user-order-detail.store';
import { ProductPageComponent } from './storefront/product-page.component';
import { CatalogStore } from './storefront/catalog.store';

class DetailStore {
  readonly order$ = new BehaviorSubject<{ id: string } | null>(null);
  readonly product$ = this.order$;
  readonly loading$ = of(false);
  readonly errorMessage$ = of('');
  readonly load = vi.fn((id: string) => this.order$.next({ id }));
  readonly loadProduct = this.load;
}

const cases: Array<{ component: Type<{ reload(): void }>; store: Type<unknown>; path: string }> = [
  { component: ProductPageComponent, store: CatalogStore, path: 'catalog/:sku' },
  { component: CustomerOrderDetailComponent, store: CustomerOrderDetailStore, path: 'customer/orders/:id' },
  { component: UserOrderDetailComponent, store: UserOrderDetailStore, path: 'user/orders/:id' },
  { component: CheckoutResultComponent, store: CustomerOrderDetailStore, path: 'checkout/result/:orderId' },
];

for (const entry of cases) {
  describe(entry.component.name + ' reused detail route', () => {
    it('ends its param subscription when the container is destroyed', async () => {
      const store = new DetailStore();
      const key = entry.path.slice(entry.path.lastIndexOf(':') + 1);
      const params = new BehaviorSubject(convertToParamMap({ [key]: 'A' }));
      TestBed.overrideComponent(entry.component, {
        set: { providers: [{ provide: entry.store, useValue: store }], template: '' },
      });
      await TestBed.configureTestingModule({
        imports: [entry.component],
        providers: [
          { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
          { provide: CartStore, useValue: { load: vi.fn() } },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(entry.component);
      fixture.detectChanges();
      expect(store.load.mock.calls).toEqual([['A']]);
      fixture.destroy();
      params.next(convertToParamMap({ [key]: 'B' }));
      expect(store.load.mock.calls).toEqual([['A']]);
    });

    it('loads and renders the current identity, retries it, and stops after destruction', async () => {
      const store = new DetailStore();
      TestBed.overrideComponent(entry.component, {
        set: {
          providers: [{ provide: entry.store, useValue: store }],
          template: '<span>{{ (store.' + (entry.store === CatalogStore ? 'product$' : 'order$') + ' | async)?.id }}</span>',
        },
      });
      await TestBed.configureTestingModule({
        providers: [
          provideRouter([{ path: entry.path, component: entry.component }]),
          { provide: CartStore, useValue: { load: vi.fn() } },
        ],
      }).compileComponents();
      const harness = await RouterTestingHarness.create();
      const path = entry.path.substring(0, entry.path.lastIndexOf('/'));
      const first = await harness.navigateByUrl('/' + path + '/A', entry.component);
      expect(store.load.mock.calls).toEqual([['A']]);
      const second = await harness.navigateByUrl('/' + path + '/B', entry.component);
      expect(second).toBe(first);
      expect(harness.routeNativeElement?.textContent).toContain('B');
      expect(store.load.mock.calls).toEqual([['A'], ['B']]);
      await harness.navigateByUrl('/' + path + '/B?status=approved&payment_id=forged', entry.component);
      expect(store.load).toHaveBeenCalledTimes(2);
      second.reload();
      expect(store.load.mock.calls).toEqual([['A'], ['B'], ['B']]);
    });
  });
}
