import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AdminOrder } from '../../domain/order/order.entity';
import { OrderStatus } from '../../domain/order/order-status';
import { PaymentStatus } from '../../domain/order/payment-status';
import { RmaStatus, RmaTransition } from '../../domain/order/rma-status';
import { ShipmentStatus, ShipmentTransition } from '../../domain/order/shipment-status';
import { UserOrderDetailViewComponent } from './user-order-detail.view';

const SHIP_LABELS = ['Empacar', 'Enviar', 'Entregar'] as const;
const RMA_LABELS = ['RMA recibido', 'Inspeccionar', 'Ajustar stock'] as const;

function order(shipmentStatus: string, rmaStatus: string | null): AdminOrder {
  return {
    id: 'ord-1',
    orderStatus: OrderStatus.Paid,
    paymentStatus: PaymentStatus.Approved,
    shipmentStatus: ShipmentStatus.fromWire(shipmentStatus),
    tracking: ShipmentStatus.fromWire(shipmentStatus) === ShipmentStatus.Shipped ? 'TRK-1' : null,
    total: 100,
    rmaStatus: RmaStatus.fromOptionalWire(rmaStatus),
    lines: [
      {
        sku: 'SKU-1',
        name: 'Taladro',
        quantity: 2,
        originalUnitPrice: 50,
        discountAmount: 0,
        offerRef: null,
        campaignRef: null,
        effectiveUnitPrice: 50,
      },
    ],
  };
}

function buttonLabels(root: ParentNode, names: readonly string[]): string[] {
  return [...root.querySelectorAll('button')]
    .map((button) => button.textContent?.trim() ?? '')
    .filter((text) => names.includes(text));
}

describe('UserOrderDetailViewComponent', () => {
  let fixture: ComponentFixture<UserOrderDetailViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserOrderDetailViewComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(UserOrderDetailViewComponent);
  });

  it('shows at most one ship button and one RMA button for the order', () => {
    const cases: Array<[string, string | null, string | null, string | null]> = [
      ['PENDING', null, 'Empacar', 'RMA recibido'],
      ['PREPARING', null, 'Enviar', 'RMA recibido'],
      ['SHIPPED', 'RETURN_RECEIVED', 'Entregar', 'Inspeccionar'],
      ['DELIVERED', 'INSPECTED', null, 'Ajustar stock'],
      ['DELIVERED', 'CLOSED', null, null],
      ['PACKED', 'ADJUSTED', 'Empacar', 'RMA recibido'],
    ];

    for (const [shipmentStatus, rmaStatus, shipLabel, rmaLabel] of cases) {
      fixture.componentRef.setInput('order', order(shipmentStatus, rmaStatus));
      fixture.detectChanges();
      const summary = fixture.nativeElement.querySelector('aside.sc-summary') as HTMLElement;
      expect(summary.querySelectorAll('button.sc-btn--primary')).toHaveLength(shipLabel ? 1 : 0);
      expect(summary.querySelectorAll('button.sc-btn--ghost')).toHaveLength(rmaLabel ? 1 : 0);
      expect(buttonLabels(summary, SHIP_LABELS)).toEqual(shipLabel ? [shipLabel] : []);
      expect(buttonLabels(summary, RMA_LABELS)).toEqual(rmaLabel ? [rmaLabel] : []);
      expect(summary.querySelectorAll('input')).toHaveLength(shipmentStatus === 'PREPARING' ? 1 : 0);
    }
  });

  it('emits the single next shipment and the single next RMA', () => {
    fixture.componentRef.setInput('order', order('PREPARING', 'RETURN_RECEIVED'));
    fixture.detectChanges();
    const summary = fixture.nativeElement.querySelector('aside.sc-summary') as HTMLElement;
    fixture.debugElement.query(By.css('aside.sc-summary input')).triggerEventHandler('ngModelChange', 'ANDES-1');

    const shipped: Array<{ orderId: string; status: ShipmentTransition; tracking: string | null }> = [];
    const returned: Array<{ orderId: string; status: RmaTransition }> = [];
    fixture.componentInstance.ship.subscribe((event) => shipped.push(event));
    fixture.componentInstance.rma.subscribe((event) => returned.push(event));

    (summary.querySelector('button.sc-btn--primary') as HTMLButtonElement).click();
    (summary.querySelector('button.sc-btn--ghost') as HTMLButtonElement).click();

    expect(shipped).toEqual([{ orderId: 'ord-1', status: ShipmentTransition.Shipped, tracking: 'ANDES-1' }]);
    expect(returned).toEqual([{ orderId: 'ord-1', status: RmaTransition.Inspected }]);
  });
});
