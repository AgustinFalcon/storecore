import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DiscountType } from '../../domain/offer/discount-type';
import { OfferStatus } from '../../domain/offer/offer-status';
import { StorefrontOffer, StorefrontOfferDraft } from '../../domain/offer/storefront-offer.entity';
import { FeatureStatusComponent } from '../../shared/feature-status.component';
import { UserOffersState } from './user-offers.store';

@Component({
  selector: 'sc-user-offers-view',
  imports: [FormsModule, RouterLink, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-offers.view.html',
})
export class UserOffersViewComponent {
  @Input({ required: true }) state!: UserOffersState;
  @Output() readonly draftChange = new EventEmitter<StorefrontOfferDraft>();
  @Output() readonly save = new EventEmitter<void>();
  @Output() readonly retry = new EventEmitter<void>();
  readonly statuses = OfferStatus.writableOptions();
  readonly discountTypes = DiscountType.options();

  patch(partial: Partial<StorefrontOfferDraft>): void {
    this.draftChange.emit({ ...this.state.draft, ...partial });
  }

  setStatus(value: string): void {
    const status = OfferStatus.fromWire(value);
    if (!status.writable) {
      return;
    }
    this.patch({ status });
  }

  setDiscountType(value: string): void {
    const discountType = DiscountType.fromWire(value);
    if (discountType === DiscountType.Unknown) {
      return;
    }
    this.patch({ discountType });
  }

  priorityOf(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
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

  discountLabel(offer: StorefrontOffer): string {
    return offer.discountType.format(offer.discountValue);
  }
}
