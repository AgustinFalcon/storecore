import { TestBed } from '@angular/core/testing';
import { mapCustomerOrder } from '../../data/mappers/http-mappers';
import { DeliverySnapshotState } from '../../domain/cart/delivery';
import { OrderFactState } from '../../domain/order/order-projection';
import { OrderFactsComponent } from './order-facts.component';

describe('OrderFactsComponent delivery decision', () => {
  it('renders the invalid decision instead of advertising an available legacy postal snapshot', () => {
    TestBed.configureTestingModule({ imports: [OrderFactsComponent] });
    const fixture = TestBed.createComponent(OrderFactsComponent);
    const order = mapCustomerOrder({
      deliveryDecision: { state: DeliverySnapshotState.Invalid.wire, value: null },
      delivery: { state: OrderFactState.Known.wire, value: {
        recipient: 'Comprador', street: 'Dirección histórica', city: 'Ciudad',
        province: 'Provincia', postalCode: '1000', country: 'AR',
      } },
    });
    expect(order.delivery.state).toBe(OrderFactState.Known);
    expect(order.deliveryDecision?.state).toBe(DeliverySnapshotState.Invalid);
    fixture.componentRef.setInput('order', order); fixture.detectChanges();
    const deliveryText = fixture.nativeElement.querySelector('h3').nextElementSibling.textContent.trim();
    expect(deliveryText).toBe(DeliverySnapshotState.Invalid.label);
    expect(deliveryText).not.toContain(OrderFactState.Known.label);
    expect(fixture.nativeElement.textContent).not.toContain('Dirección histórica');
  });
});

