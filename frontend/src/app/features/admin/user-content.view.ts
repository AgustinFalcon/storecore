import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HomeContentDraft } from '../../domain/user/user.entity';
import { HomeContentPhase } from '../../domain/user/home-content-phase';
import { homeContentDirty, UserContentState } from './user-content.store';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-user-content-view',
  imports: [FormsModule, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-content.view.html',
  styleUrl: './user-content.view.scss',
})
export class UserContentViewComponent {
  @Input({ required: true }) state!: UserContentState;
  readonly Phase = HomeContentPhase;
  @Output() readonly homeChange = new EventEmitter<HomeContentDraft>();
  @Output() readonly save = new EventEmitter<void>();
  @Output() readonly retry = new EventEmitter<void>();
  @Output() readonly discard = new EventEmitter<void>();

  get dirty(): boolean { return homeContentDirty(this.state); }

  retryOperation(): void {
    if (this.dirty) this.save.emit();
    else this.retry.emit();
  }

  patch(partial: Partial<HomeContentDraft>): void {
    this.homeChange.emit({ ...this.state.home, ...partial });
  }
}
