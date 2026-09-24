import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ManualPromo } from '../../domain/user/user.entity';
import { UserState } from './user.store';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-user-promos-view',
  imports: [FormsModule, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-promos.view.html',
})
export class UserPromosViewComponent {
  @Input({ required: true }) state!: UserState;
  @Output() readonly draftChange = new EventEmitter<ManualPromo>();
  @Output() readonly save = new EventEmitter<void>();
  @Output() readonly retry = new EventEmitter<void>();

  patch(partial: Partial<ManualPromo>): void {
    this.draftChange.emit({ ...this.state.promoDraft, ...partial });
  }
}
