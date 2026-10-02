import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { nextRma, nextShipment, rmaLabel, shipmentLabel } from '../../domain/order/fulfillment-transition';
import { AdminOrder, RmaTransition, ShipmentTransition } from '../../domain/order/order.entity';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-user-order-detail-view',
  imports: [FormsModule, RouterLink, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-order-detail.view.html',
})
export class UserOrderDetailViewComponent implements OnChanges {
  @Input() order: AdminOrder | null = null;
  @Input() loading = false;
  @Input() error = '';
  tracking = '';

  ngOnChanges(changes: SimpleChanges): void {
    const change = changes['order'];
    if (change && change.previousValue?.id !== change.currentValue?.id) this.tracking = '';
  }

  @Output() readonly ship = new EventEmitter<{ orderId: string; status: ShipmentTransition; tracking: string | null }>();
  @Output() readonly rma = new EventEmitter<{ orderId: string; status: RmaTransition }>();
  @Output() readonly retry = new EventEmitter<void>();

  readonly shipmentLabel = shipmentLabel;
  readonly rmaLabel = rmaLabel;

  nextShip(order: AdminOrder) {
    return nextShipment(order.shipmentStatus);
  }

  nextReturn(order: AdminOrder) {
    return nextRma(order.rmaStatus);
  }
}
