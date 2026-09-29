import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { OrderStatus, PaymentStatus, RmaStatus, ShipmentStatus } from '../../domain/order/closed-status';
import { AdminOrder } from '../../domain/order/order.entity';
import { UserOrderDetailViewComponent } from './user-order-detail.view';

const SHIP_LABELS = ['Empacar', 'Enviar', 'Entregar'] as const;
const RMA_LABELS = ['RMA recibido', 'Inspeccionar', 'Ajustar stock'] as const;

function order(shipmentWire: string, rmaWire: string | null): AdminOrder {
  const shipmentStatus = ShipmentStatus.fromWire(shipmentWire);
  return {
    id: 'ord-1',
    orderStatus: OrderStatus.Paid,
    paymentStatus: PaymentStatus.Approved,
    shipmentStatus,
    tracking: shipmentStatus === ShipmentStatus.Shipped ? 'TRK-1' : null,
    paymentMethod: null,
    total: 100,
    rmaStatus: rmaWire ? RmaStatus.fromWire(rmaWire) : null,
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

function confirmDialog(root: ParentNode): void {
  const button = [...root.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Confirmar') as HTMLButtonElement | undefined;
  button?.click();
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

    const shipped: Array<{ orderId: string; status: string; tracking: string | null }> = [];
    const returned: Array<{ orderId: string; status: string }> = [];
    fixture.componentInstance.ship.subscribe((event) => shipped.push(event));
    fixture.componentInstance.rma.subscribe((event) => returned.push(event));

    (summary.querySelector('button.sc-btn--primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    confirmDialog(fixture.nativeElement);
    (summary.querySelector('button.sc-btn--ghost') as HTMLButtonElement).click();
    fixture.detectChanges();
    confirmDialog(fixture.nativeElement);

    expect(shipped).toEqual([{ orderId: 'ord-1', status: 'SHIPPED', tracking: 'ANDES-1' }]);
    expect(returned).toEqual([{ orderId: 'ord-1', status: 'INSPECTED' }]);
  });
});
