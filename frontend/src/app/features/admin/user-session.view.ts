import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UserState } from './user.store';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-user-session-view',
  imports: [FormsModule, RouterLink, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-session.view.html',
})
export class UserSessionViewComponent {
  @Input({ required: true }) state!: UserState;
  @Input() authenticated = false;
  @Output() readonly emailChange = new EventEmitter<string>();
  @Output() readonly passwordChange = new EventEmitter<string>();
  @Output() readonly submitSignIn = new EventEmitter<void>();
  @Output() readonly signOut = new EventEmitter<void>();
}
