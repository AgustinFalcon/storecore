import { of } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { CustomerOrderDetailStore } from '../orders/customer-order-detail.store';
import { CheckoutResultComponent } from './checkout-result.component';

class FakeCustomerOrderDetailStore {
  readonly order$ = of(null);
  readonly loading$ = of(false);
  readonly errorMessage$ = of('');
  readonly load = vi.fn();
}

describe('CheckoutResultComponent', () => {
  let fixture: ComponentFixture<CheckoutResultComponent>;
  let store: FakeCustomerOrderDetailStore;

  beforeEach(async () => {
    TestBed.overrideComponent(CheckoutResultComponent, {
      set: { providers: [{ provide: CustomerOrderDetailStore, useClass: FakeCustomerOrderDetailStore }] },
    });
    await TestBed.configureTestingModule({
      imports: [CheckoutResultComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ orderId: 'ord-77' })),
            snapshot: {
              paramMap: convertToParamMap({ orderId: 'ord-77' }),
              queryParamMap: convertToParamMap({
                collection_status: 'approved',
                status: 'approved',
                payment_id: '123',
                payment_status: 'approved',
              }),
              queryParams: {
                collection_status: 'approved',
                status: 'approved',
                payment_id: '123',
                payment_status: 'approved',
              },
            },
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CheckoutResultComponent);
    store = fixture.componentInstance.store as unknown as FakeCustomerOrderDetailStore;
  });

  it('loads the path order id on init and reload, ignoring return query params', () => {
    fixture.detectChanges();
    expect(store.load.mock.calls).toEqual([['ord-77']]);

    fixture.componentInstance.reload();
    expect(store.load.mock.calls).toEqual([['ord-77'], ['ord-77']]);
  });
});
