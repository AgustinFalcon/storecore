import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrandingDraft, BrandingPhase, MerchantBranding } from '../../domain/branding/merchant-branding';
import { UserBrandingState } from './user-branding.state';
import { BrandingLogoComponent } from '../shell/branding-logo.component';
@Component({
  selector: 'sc-user-branding-view', imports: [FormsModule, BrandingLogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush, templateUrl: './user-branding.view.html', styleUrl: './user-branding.view.scss',
})
export class UserBrandingViewComponent {
  readonly state = input.required<UserBrandingState>();
  readonly dirty = input(false);
  readonly valid = input(false);
  readonly draftChange = output<BrandingDraft>();
  readonly publish = output<void>(); readonly reload = output<void>(); readonly discard = output<void>();
  readonly phases = BrandingPhase;
  readonly preview = computed(() => MerchantBranding.validateDraft(this.state().draft, 1) ?? this.state().published ?? MerchantBranding.Default);
  change(field: keyof BrandingDraft, value: string): void { this.draftChange.emit({ ...this.state().draft, [field]: value }); }
}
