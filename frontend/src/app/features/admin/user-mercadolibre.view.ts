import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MercadoLibreListing } from '../../domain/user/user.entity';
import { MercadoLibreAccountStatus } from '../../domain/user/mercadolibre-account-status';
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
  @Output() readonly retry = new EventEmitter<void>();

  patch(partial: Partial<MercadoLibreListing>): void {
    this.draftChange.emit({ ...this.state.listingDraft, ...partial });
  }

  parseAccountId(value: string | number | null): number | null {
    if (value === '' || value == null) {
      return null;
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  get installationEmpty(): boolean {
    return !this.state.loading && !this.state.errorMessage && !this.hasRealAccount && this.state.listings.length === 0;
  }

  get hasRealAccount(): boolean {
    const account = this.state.mlAccount;
    return account !== null
      && !(account.status === MercadoLibreAccountStatus.Disabled && account.accountRef.trim() === '');
  }
}
