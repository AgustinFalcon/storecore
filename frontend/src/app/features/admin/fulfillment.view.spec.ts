import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OrderStatus, PaymentStatus, RmaStatus, ShipmentStatus } from '../../domain/order/closed-status';
import { AdminOrder } from '../../domain/order/order.entity';
import { FulfillmentViewComponent } from './fulfillment.view';

const SHIP_LABELS = ['Empacar', 'Enviar', 'Entregar'] as const;
const RMA_LABELS = ['RMA recibido', 'Inspeccionar', 'Ajustar stock'] as const;

function order(id: string, shipmentWire: string, rmaWire: string | null): AdminOrder {
  const shipmentStatus = ShipmentStatus.fromWire(shipmentWire);
  return {
    id,
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
        quantity: 1,
        originalUnitPrice: 100,
        discountAmount: 0,
        offerRef: null,
        campaignRef: null,
        effectiveUnitPrice: 100,
      },
    ],
  };
}

function confirmDialog(root: ParentNode): void {
  const button = [...root.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Confirmar') as HTMLButtonElement | undefined;
  button?.click();
}

function buttonLabels(root: ParentNode, names: readonly string[]): string[] {
  return [...root.querySelectorAll('button')]
    .map((button) => button.textContent?.trim() ?? '')
    .filter((text) => names.includes(text));
}

describe('FulfillmentViewComponent', () => {
  let fixture: ComponentFixture<FulfillmentViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FulfillmentViewComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(FulfillmentViewComponent);
  });

  it('shows at most one ship button and one RMA button on each row', () => {
    const cases: Array<[string, string | null, string | null, string | null]> = [
      ['PENDING', null, 'Empacar', 'RMA recibido'],
      ['PREPARING', null, 'Enviar', 'RMA recibido'],
      ['SHIPPED', 'RETURN_RECEIVED', 'Entregar', 'Inspeccionar'],
      ['DELIVERED', 'INSPECTED', null, 'Ajustar stock'],
      ['DELIVERED', 'CLOSED', null, null],
      ['PACKED', 'ADJUSTED', 'Empacar', 'RMA recibido'],
    ];
    fixture.componentInstance.orders = cases.map(([shipmentStatus, rmaStatus], index) =>
      order(`ord-${index}`, shipmentStatus, rmaStatus),
    );
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows.length).toBe(cases.length);
    rows.forEach((row: HTMLTableRowElement, index: number) => {
      const actions = row.querySelector('.sc-table__actions');
      expect(actions).not.toBeNull();
      expect(actions!.querySelectorAll('button.sc-btn--primary')).toHaveLength(cases[index][2] ? 1 : 0);
      expect(actions!.querySelectorAll('button.sc-btn--ghost')).toHaveLength(cases[index][3] ? 1 : 0);
      expect(buttonLabels(actions!, SHIP_LABELS)).toEqual(cases[index][2] ? [cases[index][2]] : []);
      expect(buttonLabels(actions!, RMA_LABELS)).toEqual(cases[index][3] ? [cases[index][3]] : []);
      const trackingInputs = row.querySelectorAll('input');
      expect(trackingInputs).toHaveLength(cases[index][0] === 'PREPARING' ? 1 : 0);
    });
  });

  it('emits the single next shipment and the single next RMA', () => {
    const current = order('ord-9', 'PREPARING', 'RETURN_RECEIVED');
    fixture.componentInstance.orders = [current];
    fixture.detectChanges();
    const actions = fixture.nativeElement.querySelector('.sc-table__actions') as HTMLElement;
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'ANDES-9';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const shipped: Array<{ orderId: string; status: string; tracking: string | null }> = [];
    const returned: Array<{ orderId: string; status: string }> = [];
    fixture.componentInstance.ship.subscribe((event) => shipped.push(event));
    fixture.componentInstance.rma.subscribe((event) => returned.push(event));

    (actions.querySelector('button.sc-btn--primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    confirmDialog(fixture.nativeElement);
    (actions.querySelector('button.sc-btn--ghost') as HTMLButtonElement).click();
    fixture.detectChanges();
    confirmDialog(fixture.nativeElement);

    expect(shipped).toEqual([{ orderId: 'ord-9', status: 'SHIPPED', tracking: 'ANDES-9' }]);
    expect(returned).toEqual([{ orderId: 'ord-9', status: 'INSPECTED' }]);
  });
});
