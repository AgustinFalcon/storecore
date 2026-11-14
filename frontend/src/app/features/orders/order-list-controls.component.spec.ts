import { OrderListControlsComponent } from './order-list-controls.component';
import { OrderStatus, PaymentStatus, ShipmentStatus } from '../../domain/order/commerce-states';

describe('Order list accepted filter contract', () => {
  it('offers only the exact wire values accepted by the order HTTP query contract', () => {
    const controls = new OrderListControlsComponent();
    // This contract list intentionally lives at the test boundary to detect unsupported UI additions.
    expect(controls.orderStates.map((value) => value.wire)).toEqual(['CREATED', 'PENDING_PAYMENT', 'PAID', 'PAID_STOCK_REVIEW', 'CANCELLED', 'EXPIRED', 'REFUNDED']);
    expect(controls.paymentStates.map((value) => value.wire)).toEqual(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED', 'CHARGED_BACK']);
    expect(controls.shipmentStates.map((value) => value.wire)).toEqual(['NOT_CREATED', 'PENDING', 'PREPARING', 'SHIPPED', 'DELIVERED', ShipmentStatus.ReadyForPickup.wire, ShipmentStatus.PickedUp.wire, 'CANCELLED']);
    expect(controls.orderStates).not.toContain(OrderStatus.Unknown);
    expect(controls.paymentStates).not.toContain(PaymentStatus.Unknown);
    expect(controls.shipmentStates).not.toContain(ShipmentStatus.Unknown);
  });
});
