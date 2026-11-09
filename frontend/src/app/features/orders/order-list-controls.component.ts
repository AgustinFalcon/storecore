import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OrderStatus, PaymentStatus, ShipmentStatus } from '../../domain/order/commerce-states';
import { firstOrderPage, OrderQuery } from '../../domain/order/order-projection';

@Component({
  selector: 'sc-order-list-controls',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sc-panel">
      <label>Estado de orden <select [ngModel]="query.orderStatus ?? null" (ngModelChange)="change({orderStatus: $event})">
        <option [ngValue]="null">Todos</option>
        @for (state of orderStates; track state.wire) { <option [ngValue]="state">{{ state.label }}</option> }
      </select></label>
      <label>Estado de pago <select [ngModel]="query.paymentStatus ?? null" (ngModelChange)="change({paymentStatus: $event})">
        <option [ngValue]="null">Todos</option>
        @for (state of paymentStates; track state.wire) { <option [ngValue]="state">{{ state.label }}</option> }
      </select></label>
      <label>Estado de envío <select [ngModel]="query.shipmentStatus ?? null" (ngModelChange)="change({shipmentStatus: $event})">
        <option [ngValue]="null">Todos</option>
        @for (state of shipmentStates; track state.wire) { <option [ngValue]="state">{{ state.label }}</option> }
      </select></label>
      <nav aria-label="Páginas de órdenes">
        <button type="button" [disabled]="loading || query.page === 0" (click)="navigate(query.page - 1)">Anterior</button>
        <span>Página {{ query.page + 1 }} · {{ total }} órdenes</span>
        <button type="button" [disabled]="loading || (query.page + 1) * query.size >= total" (click)="navigate(query.page + 1)">Siguiente</button>
      </nav>
      @if (truncated) { <p>Se muestran los resultados de esta página. Hay más órdenes.</p> }
    </div>
  `,
})
export class OrderListControlsComponent {
  @Input() query: OrderQuery = firstOrderPage;
  @Input() total = 0;
  @Input() truncated = false;
  @Input() loading = false;
  @Output() readonly queryChange = new EventEmitter<OrderQuery>();
  readonly orderStates = [OrderStatus.Created, OrderStatus.PendingPayment, OrderStatus.Paid, OrderStatus.PaidStockReview, OrderStatus.Cancelled, OrderStatus.Expired, OrderStatus.Refunded];
  readonly paymentStates = [PaymentStatus.Pending, PaymentStatus.Approved, PaymentStatus.Rejected, PaymentStatus.Cancelled, PaymentStatus.Refunded, PaymentStatus.ChargedBack];
  readonly shipmentStates = [ShipmentStatus.NotCreated, ShipmentStatus.Pending, ShipmentStatus.Preparing, ShipmentStatus.Shipped, ShipmentStatus.Delivered, ShipmentStatus.Cancelled];
  change(filter: Partial<OrderQuery>): void { this.queryChange.emit({ ...this.query, ...filter, page: 0 }); }
  navigate(page: number): void { this.queryChange.emit({ ...this.query, page }); }
}
