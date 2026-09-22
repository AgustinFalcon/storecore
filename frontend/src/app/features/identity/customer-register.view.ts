import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FeatureStatusComponent } from '../../shared/feature-status.component';
import { CustomerState } from './customer.store';

@Component({
  selector: 'sc-customer-register-view',
  imports: [FormsModule, RouterLink, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-register.view.html',
})
export class CustomerRegisterViewComponent {
  @Input({ required: true }) state!: CustomerState;
  @Input() authenticated = false;
  @Output() readonly firstNameChange = new EventEmitter<string>();
  @Output() readonly lastNameChange = new EventEmitter<string>();
  @Output() readonly emailChange = new EventEmitter<string>();
  @Output() readonly passwordChange = new EventEmitter<string>();
  @Output() readonly submitRegister = new EventEmitter<void>();
}
