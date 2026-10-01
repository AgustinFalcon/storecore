import { DiscountType } from './discount-type';
import { OfferStatus } from './offer-status';

/** Row of the offers table: storefront vitrina / happy hour. The browser does not price it. */
export interface StorefrontOffer {
  readonly id: string;
  readonly name: string;
  readonly status: OfferStatus;
  readonly priority: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly discountType: DiscountType;
  readonly discountValue: string;
  readonly minMarginPercent: string;
  readonly skus: readonly string[];
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
}

export type StorefrontOfferStatus = OfferStatus;
export type StorefrontDiscountType = DiscountType;

/** Write body for POST /api/v1/user/offers. Discount fields stay operator text. */
export interface StorefrontOfferWrite {
  readonly name: string;
  readonly status: OfferStatus;
  readonly priority: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly discountType: DiscountType;
  readonly discountValue: string;
  readonly minMarginPercent: string;
  readonly skus: readonly string[];
}

export interface StorefrontOfferDraft {
  readonly name: string;
  readonly status: OfferStatus;
  readonly priority: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly discountType: DiscountType;
  readonly discountValue: string;
  readonly minMarginPercent: string;
  readonly skusText: string;
}
