import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HomeContentDraft } from '../../domain/user/user.entity';
import { UserState } from './user.store';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-user-content-view',
  imports: [FormsModule, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-content.view.html',
})
export class UserContentViewComponent {
  @Input({ required: true }) state!: UserState;
  @Output() readonly homeChange = new EventEmitter<HomeContentDraft>();
  @Output() readonly save = new EventEmitter<void>();

  patch(partial: Partial<HomeContentDraft>): void {
    this.homeChange.emit({ ...this.state.home, ...partial });
  }
}
