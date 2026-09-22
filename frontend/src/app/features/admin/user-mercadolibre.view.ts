import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MercadoLibreListing } from '../../domain/user/user.entity';
import { InstallationState } from './installation.store';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-user-mercadolibre-view',
  imports: [FormsModule, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-mercadolibre.view.html',
})
export class UserMercadoLibreViewComponent {
  @Input({ required: true }) state!: InstallationState;
  @Output() readonly draftChange = new EventEmitter<MercadoLibreListing>();
  @Output() readonly save = new EventEmitter<void>();

  patch(partial: Partial<MercadoLibreListing>): void {
    this.draftChange.emit({ ...this.state.listingDraft, ...partial });
  }
}
