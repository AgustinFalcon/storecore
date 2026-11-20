import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { mapCustomerOrder } from '../../data/mappers/http-mappers';
import { CustomerOrder } from '../../domain/order/order.entity';
import { OrderStatus, PaymentStatus, ShipmentStatus } from '../../domain/order/commerce-states';
import { CustomerOrderRefreshPhase } from '../orders/customer-order-refresh';
import { CheckoutResultViewComponent } from './checkout-result.view';

function order(paymentStatus: PaymentStatus): CustomerOrder {
  return {
    ...mapCustomerOrder({}), id: 'ORDER-1', paymentStatus,
    orderStatus: paymentStatus === PaymentStatus.Approved ? OrderStatus.Paid : OrderStatus.PendingPayment,
    shipmentStatus: ShipmentStatus.Pending, tracking: null, total: 0, lines: [],
  };
}

describe('CheckoutResultViewComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [CheckoutResultViewComponent],
    providers: [provideRouter([])],
  }));

  it('offers an explicit refresh only for pending payment', () => {
    const fixture = TestBed.createComponent(CheckoutResultViewComponent);
    fixture.componentRef.setInput('order', order(PaymentStatus.Pending));
    const emitted = vi.fn(); fixture.componentInstance.refresh.subscribe(emitted);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toContain('Actualizar estado'); button.click(); expect(emitted).toHaveBeenCalledOnce();

    fixture.componentRef.setInput('order', order(PaymentStatus.Approved)); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('announces progress and blocks repeated activation', () => {
    const fixture = TestBed.createComponent(CheckoutResultViewComponent);
    fixture.componentRef.setInput('order', order(PaymentStatus.Pending));
    fixture.detectChanges();
    const liveRegion = fixture.nativeElement.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(liveRegion).not.toBeNull();
    expect(liveRegion.hidden).toBe(true);

    fixture.componentRef.setInput('refreshPhase', CustomerOrderRefreshPhase.Refreshing);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(liveRegion.hidden).toBe(false);
    expect(liveRegion.textContent).toContain('Consultando');
  });
});
