import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RmaStatus, ShipmentStatus } from '../../domain/order/closed-status';
import { nextRma, nextShipment, rmaCommand, shipmentCommand } from '../../domain/order/fulfillment-transition';
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

  nextShip(order: AdminOrder) {
    return nextShipment(order.shipmentStatus);
  }

  nextReturn(order: AdminOrder) {
    return nextRma(order.rmaStatus);
  }

  shipCommand(status: ShipmentStatus): ShipmentTransition {
    return shipmentCommand(status);
  }

  returnCommand(status: RmaStatus): RmaTransition {
    return rmaCommand(status);
  }
}
