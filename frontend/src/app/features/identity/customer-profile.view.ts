import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CustomerProfile } from '../../domain/customer/customer.entity';
import { CustomerState } from './customer.store';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-customer-profile-view',
  imports: [FormsModule, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-profile.view.html',
})
export class CustomerProfileViewComponent {
  @Input({ required: true }) state!: CustomerState;
  @Output() readonly profileChange = new EventEmitter<CustomerProfile>();
  @Output() readonly save = new EventEmitter<void>();

  patch(partial: Partial<CustomerProfile>): void {
    this.profileChange.emit({ ...this.state.profile, ...partial });
  }
}
