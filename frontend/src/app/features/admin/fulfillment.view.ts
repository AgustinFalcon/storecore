import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { nextRma, nextShipment, rmaLabel, shipmentLabel } from '../../domain/order/fulfillment-transition';
import { shipmentStatusLabel } from '../../domain/order/status-label';
import { AdminOrder, RmaTransition, ShipmentTransition } from '../../domain/order/order.entity';
import { FeatureStatusComponent } from '../../shared/feature-status.component';
import { DialogComponent } from '../../shared/dialog.component';

@Component({
  selector: 'sc-fulfillment-view',
  imports: [FormsModule, RouterLink, FeatureStatusComponent, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fulfillment.view.html',
})
export class FulfillmentViewComponent {
  @Input() orders: readonly AdminOrder[] = [];
  @Input() loading = false;
  @Input() error = '';
  readonly tracking: Record<string, string> = {};

  @Output() readonly ship = new EventEmitter<{ orderId: string; status: ShipmentTransition; tracking: string | null }>();
  @Output() readonly rma = new EventEmitter<{ orderId: string; status: RmaTransition }>();
  @Output() readonly retry = new EventEmitter<void>();
  pendingShip: { orderId: string; status: ShipmentTransition; tracking: string | null } | null = null;
  pendingRma: { orderId: string; status: RmaTransition } | null = null;

  readonly shipmentStatusLabel = shipmentStatusLabel;

  trackingOf(orderId: string): string {
    return this.tracking[orderId] || '';
  }

  nextShip(order: AdminOrder) {
    return nextShipment(order.shipmentStatus);
  }

  nextReturn(order: AdminOrder) {
    return nextRma(order.rmaStatus);
  }

  shipLabel(status: ShipmentTransition) {
    return shipmentLabel(status);
  }

  returnLabel(status: RmaTransition) {
    return rmaLabel(status);
  }
}
