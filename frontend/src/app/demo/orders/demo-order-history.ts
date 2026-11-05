import { PaymentStatus } from '../../domain/order/commerce-states';
import { DemoContext, type DemoOrder } from '../demo-model';
import { PresentResultStep } from '../checkout/demo-checkout-result';
import { DemoOrderDate } from './demo-order-date';

export class OrderPaymentFilter {
  private constructor(readonly wire: string, readonly label: string, private readonly payment: PaymentStatus | null) {}
  static readonly All = new OrderPaymentFilter('', 'Todos los pagos', null);
  static readonly Pending = new OrderPaymentFilter(PaymentStatus.Pending.wire, PaymentStatus.Pending.label, PaymentStatus.Pending);
  static readonly Approved = new OrderPaymentFilter(PaymentStatus.Approved.wire, PaymentStatus.Approved.label, PaymentStatus.Approved);
  static readonly Rejected = new OrderPaymentFilter(PaymentStatus.Rejected.wire, PaymentStatus.Rejected.label, PaymentStatus.Rejected);
  static readonly Cancelled = new OrderPaymentFilter(PaymentStatus.Cancelled.wire, PaymentStatus.Cancelled.label, PaymentStatus.Cancelled);
  static readonly Refunded = new OrderPaymentFilter(PaymentStatus.Refunded.wire, PaymentStatus.Refunded.label, PaymentStatus.Refunded);
  static readonly ChargedBack = new OrderPaymentFilter(PaymentStatus.ChargedBack.wire, PaymentStatus.ChargedBack.label, PaymentStatus.ChargedBack);
  static readonly Unknown = new OrderPaymentFilter(PaymentStatus.Unknown.wire, PaymentStatus.Unknown.label, PaymentStatus.Unknown);
  static readonly all = [this.All, this.Pending, this.Approved, this.Rejected, this.Cancelled, this.Refunded, this.ChargedBack, this.Unknown] as const;
  static fromWire(raw: unknown): OrderPaymentFilter { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
  matches(order: DemoOrder): boolean { return this.payment === null || order.payment === this.payment; }
}

export class OrderHistoryQueryStatus {
  private constructor(readonly label: string) {}
  static readonly Valid = new OrderHistoryQueryStatus('Filtros válidos');
  static readonly Unknown = new OrderHistoryQueryStatus('Hay filtros no reconocidos. Limpiá los filtros para volver a todos tus pedidos.');
}

export class OrderHistoryCriteria {
  private constructor(readonly search: string, readonly payment: OrderPaymentFilter, readonly page: number, readonly status: OrderHistoryQueryStatus) {}
  static fromWire(raw: { q?: unknown; payment?: unknown; page?: unknown }): OrderHistoryCriteria {
    const search = typeof raw.q === 'string' ? raw.q.trim().slice(0,200) : '';
    const payment = raw.payment === undefined || raw.payment === null ? OrderPaymentFilter.All : OrderPaymentFilter.fromWire(raw.payment);
    const page = raw.page === undefined || raw.page === null || raw.page === '' ? 1 : typeof raw.page === 'string' && /^[1-9]\d{0,5}$/.test(raw.page) ? Number(raw.page) : 0;
    const validPayment = raw.payment === undefined || raw.payment === null || OrderPaymentFilter.all.some(value => value.wire === raw.payment);
    return new OrderHistoryCriteria(search, payment, page || 1, validPayment && page > 0 && (raw.q === undefined || raw.q === null || typeof raw.q === 'string') ? OrderHistoryQueryStatus.Valid : OrderHistoryQueryStatus.Unknown);
  }
  get query(): { q?: string; payment?: string; page?: string } { return { ...(this.search ? { q:this.search } : {}), ...(this.payment !== OrderPaymentFilter.All ? { payment:this.payment.wire } : {}), ...(this.page > 1 ? { page:String(this.page) } : {}) }; }
}

export class SelectOwnedOrdersStep {
  execute(orders: readonly DemoOrder[], context: DemoContext, actor: string): DemoOrder[] { return context === DemoContext.Customer ? orders.filter(order => order.actor === actor) : []; }
}
export class DateOrdersStep {
  execute(orders: readonly DemoOrder[]) { return orders.map((order,index) => ({ order, date:DemoOrderDate.fromWire(order.createdDate), index })); }
}
type DatedOrder = ReturnType<DateOrdersStep['execute']>[number];
export class FilterOrdersStep {
  execute(orders: readonly DatedOrder[], criteria: OrderHistoryCriteria): DatedOrder[] {
    const search = criteria.search.toLocaleLowerCase('es-AR');
    return orders.filter(({order}) => criteria.payment.matches(order) && (!search || [order.id,...order.lines.flatMap(line => [line.sku,line.name])].some(value => typeof value === 'string' && value.toLocaleLowerCase('es-AR').includes(search))));
  }
}
export class SortOrdersStep {
  execute(orders: readonly DatedOrder[]): DatedOrder[] { return [...orders].sort((a,b) => a.date.compareNewest(b.date) || a.index-b.index); }
}
export class PageOrdersStep {
  static readonly size = 5;
  execute(orders: readonly DatedOrder[], requestedPage: number) { const pages = Math.max(1,Math.ceil(orders.length/PageOrdersStep.size)), page = Math.min(requestedPage,pages); return { page,pages, rows:orders.slice((page-1)*PageOrdersStep.size,page*PageOrdersStep.size) }; }
}
export class ProjectOrdersStep {
  private readonly present = new PresentResultStep();
  execute(orders: readonly DatedOrder[]) { return orders.map(row => ({ ...row, result:this.present.execute(row.order) })); }
}
/** Read-only pipeline: ownership precedes all counts, date parsing and search. */
export class DemoOrderHistory {
  private readonly own = new SelectOwnedOrdersStep();
  private readonly date = new DateOrdersStep();
  private readonly filter = new FilterOrdersStep();
  private readonly sort = new SortOrdersStep();
  private readonly paginate = new PageOrdersStep();
  private readonly project = new ProjectOrdersStep();
  execute(orders: readonly DemoOrder[], context: DemoContext, actor: string, criteria: OrderHistoryCriteria) {
    const owned = this.own.execute(orders,context,actor), filtered = this.sort.execute(this.filter.execute(this.date.execute(owned),criteria));
    const page = this.paginate.execute(filtered,criteria.page);
    return { total:owned.length, found:filtered.length, page:page.page, pages:page.pages, rows:this.project.execute(page.rows) };
  }
}
