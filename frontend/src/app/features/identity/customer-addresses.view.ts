import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CustomerAddress } from '../../domain/customer/customer.entity';
import { CustomerState } from './customer.store';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-customer-addresses-view',
  imports: [FormsModule, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-addresses.view.html',
})
export class CustomerAddressesViewComponent {
  @Input({ required: true }) state!: CustomerState;
  @Output() readonly draftChange = new EventEmitter<CustomerAddress>();
  @Output() readonly save = new EventEmitter<void>();
  @Output() readonly remove = new EventEmitter<string>();
  @Output() readonly clearDraft = new EventEmitter<void>();
  @Output() readonly retry = new EventEmitter<void>();

  patch(partial: Partial<CustomerAddress>): void {
    this.draftChange.emit({ ...this.state.addressDraft, ...partial });
  }
}
