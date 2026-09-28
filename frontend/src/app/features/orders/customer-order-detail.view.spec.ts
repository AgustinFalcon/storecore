import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CustomerOrder } from '../../domain/order/order.entity';
import { CustomerOrderDetailViewComponent } from './customer-order-detail.view';

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

describe('customer order detail snapshot price', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CustomerOrderDetailViewComponent],
      providers: [provideRouter([])],
    });
  });

  function render(current: CustomerOrder): HTMLElement {
    const fixture = TestBed.createComponent(CustomerOrderDetailViewComponent);
    fixture.componentRef.setInput('order', current);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function cells(view: HTMLElement): HTMLTableCellElement[] {
    return [...view.querySelectorAll('tbody tr td')] as HTMLTableCellElement[];
  }

  it('shows the struck original and the discount amount when the line has a real discount', () => {
    const view = render(order(line()));
    const row = cells(view);
    expect(row[2].querySelector('.sc-price__was')?.textContent).toContain('100');
    expect(row[3].textContent).toContain('20');
    expect(row[4].textContent).toContain('Efectivo');
    expect(row[4].textContent).toContain('80');
    expect(view.textContent).toContain('Original');
    expect(view.textContent).toContain('Dto');
    expect(view.textContent).not.toContain('O-1');
    expect(view.textContent).not.toContain('C-1');
    expect(view.textContent).toContain('Lectura solamente');
  });

  it('shows only the effective price when the discount is zero', () => {
    const view = render(order(line({ originalUnitPrice: 100, discountAmount: 0, effectiveUnitPrice: 80 })));
    const row = cells(view);
    expect(view.querySelector('.sc-price__was')).toBeNull();
    expect(row[2].textContent?.trim()).toBe('');
    expect(row[3].textContent?.trim()).toBe('');
    expect(row[4].textContent).toContain('80');
    expect(view.textContent).not.toContain('100');
  });

  it('shows only the effective price when the original is not greater', () => {
    const view = render(order(line({ originalUnitPrice: 80, discountAmount: 15, effectiveUnitPrice: 90 })));
    const row = cells(view);
    expect(view.querySelector('.sc-price__was')).toBeNull();
    expect(row[2].textContent?.trim()).toBe('');
    expect(row[3].textContent?.trim()).toBe('');
    expect(row[4].textContent).toContain('90');
    expect(view.textContent).not.toContain('80');
    expect(view.textContent).not.toContain('15');
  });
});
