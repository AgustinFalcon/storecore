import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InventoryFilter } from '../../domain/user/inventory-filter';
import { InventoryRow } from '../../domain/user/user.entity';
import { InventoryReadState } from './user-inventory-read-state';
import { UserInventoryState } from './user-inventory.store';

@Component({
  selector: 'sc-user-inventory-view',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-inventory.view.html',
  styleUrl: './user-inventory.view.scss',
})
export class UserInventoryViewComponent {
  @Input({ required: true }) state!: UserInventoryState;
  @Output() readonly retry = new EventEmitter<void>();
  @Output() readonly queryChange = new EventEmitter<string>();
  @Output() readonly filterChange = new EventEmitter<InventoryFilter>();
  @Output() readonly clearFilters = new EventEmitter<void>();
  readonly filters = InventoryFilter.values;
  get unknownReadState(): boolean { return this.state.readState === InventoryReadState.Unknown; }

  get visibleRows(): readonly InventoryRow[] {
    const query = this.state.query.trim().toLocaleLowerCase();
    return this.state.rows.filter((row) => row.sku.toLocaleLowerCase().includes(query) && this.state.filter.matches(row));
  }

  get availableTotal(): number | null {
    return this.sum((row) => row.availableQuantity);
  }

  get reservedTotal(): number | null {
    return this.sum((row) => row.reservedQuantity);
  }

  get safetyTotal(): number | null {
    return this.sum((row) => row.safetyStock);
  }

  private sum(pick: (row: InventoryRow) => number | null): number | null {
    let total = 0;
    for (const row of this.state.rows) {
      const value = pick(row);
      if (value === null) return null;
      total += value;
    }
    return total;
  }
}
