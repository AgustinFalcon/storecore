import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { allowedRma, allowedShipment, rmaLabel, shipmentLabel } from '../../domain/order/fulfillment-transition';
import { AdminOrder, RmaTransition, ShipmentTransition } from '../../domain/order/order.entity';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-fulfillment-view',
  imports: [FormsModule, RouterLink, FeatureStatusComponent],
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

  trackingOf(orderId: string): string {
    return this.tracking[orderId] || '';
  }

  nextShip(order: AdminOrder) {
    return this.loading ? null : allowedShipment(order);
  }

  nextReturn(order: AdminOrder) {
    return this.loading ? null : allowedRma(order);
  }

  shipLabel(status: ShipmentTransition) {
    return shipmentLabel(status);
  }

  returnLabel(status: RmaTransition) {
    return rmaLabel(status);
  }
}
