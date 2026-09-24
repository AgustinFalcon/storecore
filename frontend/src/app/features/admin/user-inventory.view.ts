import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { InventoryRow } from '../../domain/user/user.entity';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-user-inventory-view',
  imports: [FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-inventory.view.html',
})
export class UserInventoryViewComponent {
  @Input() rows: readonly InventoryRow[] = [];
  @Input() loading = false;
  @Input() error = '';
  @Output() readonly retry = new EventEmitter<void>();

  private sum(pick: (row: InventoryRow) => number): number {
    return this.rows.reduce((total, row) => total + pick(row), 0);
  }

  get availableTotal(): number {
    return this.sum((row) => row.availableQuantity);
  }

  get reservedTotal(): number {
    return this.sum((row) => row.reservedQuantity);
  }

  get safetyTotal(): number {
    return this.sum((row) => row.safetyStock);
  }
}
