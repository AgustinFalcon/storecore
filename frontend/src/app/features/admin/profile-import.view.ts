import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UserState } from './user.store';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-profile-import-view',
  imports: [FormsModule, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-import.view.html',
})
export class ProfileImportViewComponent {
  @Input({ required: true }) state!: UserState;
  @Output() readonly manifestChange = new EventEmitter<string>();
  @Output() readonly preview = new EventEmitter<void>();
  @Output() readonly merge = new EventEmitter<void>();

  get canMerge(): boolean {
    return this.state.preview?.compatible === true && this.state.previewManifest === this.state.manifest;
  }
}
