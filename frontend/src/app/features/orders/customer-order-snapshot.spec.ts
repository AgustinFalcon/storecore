import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CustomerOrder } from '../../domain/order/order.entity';
import { OrderStatus } from '../../domain/order/order-status';
import { PaymentStatus } from '../../domain/order/payment-status';
import { ShipmentStatus } from '../../domain/order/shipment-status';
import { CustomerOrderDetailViewComponent } from './customer-order-detail.view';
import { CustomerOrdersViewComponent } from './customer-orders.view';
import { moneyWasSent } from './order-line-money';

const ORDER_ID = 'ord-rio-8841';
const ORIGINAL = 18450;
const DISCOUNT = 2150;
const EFFECTIVE = 16300;
const TOTAL = 32600;

function line(partial: Partial<CustomerOrder['lines'][number]> = {}): CustomerOrder['lines'][number] {
  return {
    sku: 'SKU-RIO-1',
    name: 'Lámpara de pie',
    quantity: 2,
    originalUnitPrice: ORIGINAL,
    discountAmount: DISCOUNT,
    offerRef: 'offer-interno',
    campaignRef: 'campana-interna',
    effectiveUnitPrice: EFFECTIVE,
    ...partial,
  };
}

function order(overrides: Partial<CustomerOrder> = {}): CustomerOrder {
  return {
    id: ORDER_ID,
    orderStatus: OrderStatus.PendingPayment,
    paymentStatus: PaymentStatus.Rejected,
    shipmentStatus: ShipmentStatus.Preparing,
    tracking: null,
    total: TOTAL,
    lines: [line()],
    ...overrides,
  };
}

function text(root: HTMLElement, selector: string): string {
  return root.querySelector(selector)?.textContent ?? '';
}

describe('moneyWasSent', () => {
  it('accepts a finite amount, including zero', () => {
    expect(moneyWasSent(0)).toBe(true);
    expect(moneyWasSent(EFFECTIVE)).toBe(true);
  });

  it('rejects a price the API did not send', () => {
    expect(moneyWasSent(undefined)).toBe(false);
    expect(moneyWasSent(null)).toBe(false);
    expect(moneyWasSent(Number.NaN)).toBe(false);
  });
});

describe('customer order snapshot', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
  });

  it('lists only the orders it received, with order and payment as separate facts', () => {
    const fixture = TestBed.createComponent(CustomerOrdersViewComponent);
    fixture.componentRef.setInput('orders', [order()]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Sólo las órdenes de esta cuenta customer');
    expect(text(root, '[data-fact="order"]')).toContain(`orden ${OrderStatus.PendingPayment.label}`);
    expect(text(root, '[data-fact="payment"]')).toContain(`pago ${PaymentStatus.Rejected.label}`);
    expect(text(root, '[data-fact="order"]')).not.toContain(PaymentStatus.Rejected.label);
    expect(text(root, '[data-fact="payment"]')).not.toContain(OrderStatus.PendingPayment.label);
    expect(root.querySelector('a')?.getAttribute('href')).toBe(`/customer/orders/${ORDER_ID}`);
    expect(root.textContent).toContain(String(TOTAL));
    expect(root.textContent).toContain(String(EFFECTIVE));
    expect(root.textContent).not.toContain('offer-interno');
    expect(root.textContent).not.toContain('ord-1042');
    expect(root.querySelectorAll('button').length).toBe(0);
    expect(root.querySelector('img')).toBeNull();
    expect(root.innerHTML.toLowerCase()).not.toContain('mercadopago');
    expect(root.innerHTML.toLowerCase()).not.toContain('confetti');
  });

  it('keeps the empty list and the retry on the list', () => {
    const fixture = TestBed.createComponent(CustomerOrdersViewComponent);
    fixture.componentRef.setInput('orders', []);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Este customer no tiene órdenes.');
    expect(root.querySelector('.sc-order-list')).toBeNull();

    const retry = vi.fn();
    fixture.componentInstance.retry.subscribe(retry);
    fixture.componentRef.setInput('error', 'No se pudo leer el listado');
    fixture.detectChanges();
    const button = root.querySelector('button');
    expect(button?.textContent).toContain('Reintentar');
    expect(root.textContent).not.toContain('Este customer no tiene órdenes.');
    button?.click();
    expect(retry).toHaveBeenCalledOnce();
  });

  it('shows original, discount and effective on the detail when the API sent them', () => {
    const fixture = TestBed.createComponent(CustomerOrderDetailViewComponent);
    fixture.componentRef.setInput('order', order());
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain(`Orden ${ORDER_ID}`);
    expect(root.textContent).toContain('La orden y el pago son datos distintos');
    expect(text(root, '[data-fact="order"]')).toContain(`orden ${OrderStatus.PendingPayment.label}`);
    expect(text(root, '[data-fact="payment"]')).toContain(`pago ${PaymentStatus.Rejected.label}`);
    expect(text(root, '[data-fact="order"]')).not.toContain(PaymentStatus.Rejected.label);
    expect(text(root, '[data-fact="payment"]')).not.toContain(OrderStatus.PendingPayment.label);
    expect(text(root, '[data-fact="original"]')).toContain('Original');
    expect(text(root, '[data-fact="original"]')).toContain(String(ORIGINAL));
    expect(text(root, '[data-fact="discount"]')).toContain('Descuento');
    expect(text(root, '[data-fact="discount"]')).toContain(String(DISCOUNT));
    expect(text(root, '[data-fact="effective"]')).toContain('Efectivo');
    expect(text(root, '[data-fact="effective"]')).toContain(String(EFFECTIVE));
    expect(root.textContent).toContain(String(TOTAL));
    expect(root.textContent).toContain('Lectura solamente');
    expect(root.textContent).not.toContain('offer-interno');
    expect(root.textContent).not.toContain('campana-interna');
    expect(root.textContent).not.toContain('ord-1042');
    expect(root.querySelectorAll('button').length).toBe(0);
    expect(root.querySelector('img')).toBeNull();
    expect(root.innerHTML.toLowerCase()).not.toContain('mercadopago');
    expect(root.innerHTML.toLowerCase()).not.toContain('confetti');
  });

  it('omits a line amount the API did not send and still shows a zero discount', () => {
    const fixture = TestBed.createComponent(CustomerOrderDetailViewComponent);
    fixture.componentRef.setInput(
      'order',
      order({
        lines: [line({ originalUnitPrice: undefined as unknown as number, discountAmount: 0 })],
      }),
    );
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(text(root, '[data-fact="original"]').trim()).toBe('');
    expect(root.textContent).not.toContain(String(ORIGINAL));
    expect(text(root, '[data-fact="discount"]')).toContain('Descuento');
    expect(text(root, '[data-fact="discount"]')).toContain('0');
    expect(text(root, '[data-fact="effective"]')).toContain(String(EFFECTIVE));
  });

  it('keeps the empty detail and the retry', () => {
    const fixture = TestBed.createComponent(CustomerOrderDetailViewComponent);
    fixture.componentRef.setInput('order', null);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Orden no disponible para este customer.');
    expect(root.querySelector('table')).toBeNull();

    const retry = vi.fn();
    fixture.componentInstance.retry.subscribe(retry);
    fixture.componentRef.setInput('error', 'No se pudo leer la orden');
    fixture.detectChanges();
    const button = root.querySelector('button');
    expect(button?.textContent).toContain('Reintentar');
    expect(root.textContent).not.toContain('Orden no disponible para este customer.');
    button?.click();
    expect(retry).toHaveBeenCalledOnce();
  });
});
