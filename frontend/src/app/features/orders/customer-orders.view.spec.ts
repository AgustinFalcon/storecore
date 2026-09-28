import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CustomerOrder } from '../../domain/order/order.entity';
import { CustomerOrdersViewComponent } from './customer-orders.view';

function line(partial: Partial<CustomerOrder['lines'][number]> = {}): CustomerOrder['lines'][number] {
  return {
    sku: 'SKU-1',
    name: 'Lámpara',
    quantity: 1,
    originalUnitPrice: 100,
    discountAmount: 20,
    offerRef: 'O-1',
    campaignRef: 'C-1',
    effectiveUnitPrice: 80,
    ...partial,
  };
}

function order(item: CustomerOrder['lines'][number]): CustomerOrder {
  return {
    id: 'ORD-1',
    orderStatus: 'PAID',
    paymentStatus: 'APPROVED',
    shipmentStatus: 'PREPARING',
    tracking: null,
    paymentMethod: null,
    total: 900,
    lines: [item],
  };
}

describe('customer orders snapshot price', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CustomerOrdersViewComponent],
      providers: [provideRouter([])],
    });
  });

  function render(orders: readonly CustomerOrder[]): HTMLElement {
    const fixture = TestBed.createComponent(CustomerOrdersViewComponent);
    fixture.componentRef.setInput('orders', orders);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the struck original when the line has a real discount', () => {
    const view = render([order(line())]);
    const struck = view.querySelector('.sc-order-card__lines .sc-price__was');
    expect(struck?.textContent).toContain('100');
    expect(view.querySelector('.sc-order-card__lines .sc-price__kind')?.textContent).toContain('Efectivo');
    expect(view.querySelector('.sc-order-card__lines .sc-price')?.textContent).toContain('80');
    expect(view.textContent).not.toContain('O-1');
    expect(view.textContent).not.toContain('C-1');
  });

  it('shows only the effective price when the discount is zero', () => {
    const view = render([order(line({ originalUnitPrice: 100, discountAmount: 0, effectiveUnitPrice: 80 }))]);
    expect(view.querySelector('.sc-price__was')).toBeNull();
    expect(view.querySelector('.sc-order-card__lines .sc-price')?.textContent).toContain('80');
    expect(view.textContent).not.toContain('100');
    expect(view.textContent).not.toContain('dto');
  });

  it('shows only the effective price when the original is not greater', () => {
    const view = render([order(line({ originalUnitPrice: 80, discountAmount: 15, effectiveUnitPrice: 90 }))]);
    expect(view.querySelector('.sc-price__was')).toBeNull();
    expect(view.querySelector('.sc-order-card__lines .sc-price')?.textContent).toContain('90');
    expect(view.textContent).not.toContain('80');
    expect(view.textContent).not.toContain('15');
    expect(view.textContent).not.toContain('dto');
  });
});
