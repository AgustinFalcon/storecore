import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UserState } from './user.store';
import { FeatureStatusComponent } from '../../shared/feature-status.component';
import { DialogComponent } from '../../shared/dialog.component';

@Component({
  selector: 'sc-profile-import-view',
  imports: [FormsModule, FeatureStatusComponent, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-import.view.html',
})
export class ProfileImportViewComponent implements OnChanges {
  @Input({ required: true }) state!: UserState;
  @Output() readonly manifestChange = new EventEmitter<string>();
  @Output() readonly preview = new EventEmitter<void>();
  @Output() readonly merge = new EventEmitter<void>();
  confirming = false;
  incompatibleOpen = false;
  private seenPreview: UserState['preview'] = null;

  ngOnChanges(): void {
    const preview = this.state.preview;
    if (preview && preview !== this.seenPreview && preview.compatible === false) {
      this.incompatibleOpen = true;
    }
    this.seenPreview = preview;
  }

  get canMerge(): boolean {
    return this.state.preview?.compatible === true && this.state.previewManifest === this.state.manifest;
  }
}
