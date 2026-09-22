import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CustomerState } from './customer.store';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-customer-session-view',
  imports: [FormsModule, RouterLink, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-session.view.html',
})
export class CustomerSessionViewComponent {
  @Input({ required: true }) state!: CustomerState;
  @Input() authenticated = false;
  @Output() readonly emailChange = new EventEmitter<string>();
  @Output() readonly passwordChange = new EventEmitter<string>();
  @Output() readonly submitSignIn = new EventEmitter<void>();
  @Output() readonly signOut = new EventEmitter<void>();
}
