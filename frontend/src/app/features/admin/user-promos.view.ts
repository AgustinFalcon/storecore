import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ManualPromo } from '../../domain/user/user.entity';
import { CreateManualPromo, PolicyStatus, PolicyTransition, PriceCurrency, PriceScope, PriceWriter } from '../../domain/user/channel-pricing';
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
  @Output() readonly draftChange = new EventEmitter<CreateManualPromo>();
  @Output() readonly save = new EventEmitter<void>();
  @Output() readonly retry = new EventEmitter<void>();

  @Output() readonly pageChange = new EventEmitter<number>();
  @Output() readonly transition = new EventEmitter<{ promo: ManualPromo; transition: PolicyTransition }>();
  readonly scopes = PriceScope.selectable;
  readonly formError = signal('');
  transitions(promo: ManualPromo): readonly PolicyTransition[] { return promo.status !== PolicyStatus.Unknown && promo.priceScope !== PriceScope.Unknown && promo.currency !== PriceCurrency.Unknown && promo.writer !== PriceWriter.Unknown ? PolicyTransition.for(promo.status) : []; }
  submit(): void {
    this.formError.set('');
    const draft = this.state.promoDraft;
    if (!draft.listingSku.trim() || !Number.isFinite(draft.desiredPrice) || draft.desiredPrice < 0 || draft.effectivePromoPrice !== null && (!Number.isFinite(draft.effectivePromoPrice) || draft.effectivePromoPrice < 0)) { this.formError.set('Ingresá un SKU y precios válidos.'); return; }
    const from = Date.parse(draft.validFrom); const to = Date.parse(draft.validTo);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) { this.formError.set('La vigencia debe tener un inicio válido y un final posterior.'); return; }
    this.draftChange.emit({ ...draft, validFrom: new Date(from).toISOString(), validTo: new Date(to).toISOString() }); this.save.emit();
  }
  patch(partial: Partial<CreateManualPromo>): void {
    this.draftChange.emit({ ...this.state.promoDraft, ...partial });
  }
}
