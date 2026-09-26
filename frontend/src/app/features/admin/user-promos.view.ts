import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ManualPromo } from '../../domain/user/user.entity';
import { UserState } from './user.store';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-user-promos-view',
  imports: [FormsModule, RouterLink, FeatureStatusComponent],
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

  clock(value: string): string {
    const trimmed = value.trim();
    const parsed = Date.parse(trimmed);
    if (!Number.isFinite(parsed)) {
      return trimmed;
    }
    const date = new Date(parsed);
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}
