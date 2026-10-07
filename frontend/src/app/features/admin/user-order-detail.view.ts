import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { allowedRma, allowedShipment, rmaLabel, shipmentLabel } from '../../domain/order/fulfillment-transition';
import { AdminOrder, RmaTransition, ShipmentTransition } from '../../domain/order/order.entity';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-user-order-detail-view',
  imports: [FormsModule, RouterLink, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-order-detail.view.html',
})
export class UserOrderDetailViewComponent {
  @Input() order: AdminOrder | null = null;
  @Input() loading = false;
  @Input() error = '';
  tracking = '';

  @Output() readonly ship = new EventEmitter<{ orderId: string; status: ShipmentTransition; tracking: string | null }>();
  @Output() readonly rma = new EventEmitter<{ orderId: string; status: RmaTransition }>();
  @Output() readonly retry = new EventEmitter<void>();

  readonly shipmentLabel = shipmentLabel;
  readonly rmaLabel = rmaLabel;

  nextShip(order: AdminOrder) {
    return this.loading ? null : allowedShipment(order);
  }

  nextReturn(order: AdminOrder) {
    return this.loading ? null : allowedRma(order);
  }
}
