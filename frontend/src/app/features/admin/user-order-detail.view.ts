import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { nextRma, nextShipment, rmaLabel, shipmentLabel } from '../../domain/order/fulfillment-transition';
import { orderStatusLabel, paymentStatusLabel, shipmentStatusLabel } from '../../domain/order/status-label';
import { AdminOrder, RmaTransition, ShipmentTransition } from '../../domain/order/order.entity';
import { FeatureStatusComponent } from '../../shared/feature-status.component';
import { DialogComponent } from '../../shared/dialog.component';

@Component({
  selector: 'sc-user-order-detail-view',
  imports: [FormsModule, RouterLink, FeatureStatusComponent, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-order-detail.view.html',
})
export class UserOrderDetailViewComponent {
  @Input() order: AdminOrder | null = null;
  @Input() loading = false;
  @Input() error = '';
  tracking = '';
  pendingShip = false;
  pendingRma = false;

  @Output() readonly ship = new EventEmitter<{ orderId: string; status: ShipmentTransition; tracking: string | null }>();
  @Output() readonly rma = new EventEmitter<{ orderId: string; status: RmaTransition }>();
  @Output() readonly retry = new EventEmitter<void>();

  readonly shipmentLabel = shipmentLabel;
  readonly rmaLabel = rmaLabel;
  readonly orderStatusLabel = orderStatusLabel;
  readonly paymentStatusLabel = paymentStatusLabel;
  readonly shipmentStatusLabel = shipmentStatusLabel;

  nextShip(order: AdminOrder) {
    return nextShipment(order.shipmentStatus);
  }

  nextReturn(order: AdminOrder) {
    return nextRma(order.rmaStatus);
  }
}
