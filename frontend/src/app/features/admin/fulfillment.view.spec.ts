import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminOrder } from '../../domain/order/order.entity';
import { OrderStatus } from '../../domain/order/order-status';
import { PaymentStatus } from '../../domain/order/payment-status';
import { RmaStatus, RmaTransition } from '../../domain/order/rma-status';
import { ShipmentStatus, ShipmentTransition } from '../../domain/order/shipment-status';
import { FulfillmentViewComponent } from './fulfillment.view';

const SHIP_LABELS = ['Empacar', 'Enviar', 'Entregar'] as const;
const RMA_LABELS = ['RMA recibido', 'Inspeccionar', 'Ajustar stock'] as const;

function order(id: string, shipmentStatus: string, rmaStatus: string | null): AdminOrder {
  return {
    id,
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
      ['PACKED', 'ADJUSTED', null, null],
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
      trackingInputs.forEach((input) => {
        expect(input.getAttribute('aria-label')).toBe(`Tracking de la orden ord-${index}`);
      });
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

    const shipped: Array<{ orderId: string; status: ShipmentTransition; tracking: string | null }> = [];
    const returned: Array<{ orderId: string; status: RmaTransition }> = [];
    fixture.componentInstance.ship.subscribe((event) => shipped.push(event));
    fixture.componentInstance.rma.subscribe((event) => returned.push(event));

    (actions.querySelector('button.sc-btn--primary') as HTMLButtonElement).click();
    (actions.querySelector('button.sc-btn--ghost') as HTMLButtonElement).click();

    expect(shipped).toEqual([{ orderId: 'ord-9', status: ShipmentTransition.Shipped, tracking: 'ANDES-9' }]);
    expect(returned).toEqual([{ orderId: 'ord-9', status: RmaTransition.Inspected }]);
  });

  it('shows fixed unknown labels without offering fulfillment actions', () => {
    fixture.componentInstance.orders = [{
      ...order('ord-unknown', ShipmentStatus.Pending.wire, null),
      shipmentStatus: ShipmentStatus.Unknown,
      rmaStatus: RmaStatus.Unknown,
    }];
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('tbody tr') as HTMLTableRowElement;
    expect(row.textContent).toContain(ShipmentStatus.Unknown.label);
    expect(row.textContent).toContain(RmaStatus.Unknown.label);
    expect(row.querySelectorAll('.sc-table__actions button')).toHaveLength(0);
    expect(row.querySelectorAll('input')).toHaveLength(0);
  });
});
