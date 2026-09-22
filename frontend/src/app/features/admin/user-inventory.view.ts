import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
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
}
