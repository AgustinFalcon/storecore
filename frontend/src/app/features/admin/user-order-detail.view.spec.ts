import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  FulfillmentEligibility,
  OrderStatus,
  PaymentStatus,
  RmaStatus,
  RmaTransition,
  ShipmentStatus,
  ShipmentTransition,
} from '../../domain/order/commerce-states';
import { AdminOrder } from '../../domain/order/order.entity';
import { UserOrderDetailViewComponent } from './user-order-detail.view';

function order(id: string): AdminOrder {
  return {
    id,
    orderStatus: OrderStatus.Paid,
    paymentStatus: PaymentStatus.Approved,
    shipmentStatus: ShipmentStatus.Preparing,
    rmaStatus: RmaStatus.None,
    fulfillmentEligibility: FulfillmentEligibility.Eligible,
    shipmentAction: ShipmentTransition.Shipped,
    rmaAction: RmaTransition.Received,
    tracking: null,
    total: 0,
    lines: [],
  };
}

describe('UserOrderDetailView route-local state', () => {
  it('clears the tracking draft when the order identity changes and exposes no busy commands', () => {
    TestBed.configureTestingModule({ imports: [UserOrderDetailViewComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(UserOrderDetailViewComponent);
    fixture.componentRef.setInput('order', order('A'));
    fixture.detectChanges();
    fixture.componentInstance.tracking = 'TRACK-A';
    fixture.componentRef.setInput('order', order('B'));
    fixture.detectChanges();
    expect(fixture.componentInstance.tracking).toBe('');
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    const actions = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .filter((button) => button.textContent?.includes('Enviar') || button.textContent?.includes('RMA'));
    expect(actions).toEqual([]);
  });
});
