/** Row of the offers table: storefront vitrina / happy hour. The browser does not price it. */
export interface StorefrontOffer {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly priority: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly discountType: string;
  readonly discountValue: string;
  readonly minMarginPercent: string;
  readonly skus: readonly string[];
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
}

export type StorefrontOfferStatus = 'DRAFT' | 'ACTIVE';
export type StorefrontDiscountType = 'PERCENT' | 'FIXED';

/** Write body for POST /api/v1/user/offers. Discount fields stay operator text. */
export interface StorefrontOfferWrite {
  readonly name: string;
  readonly status: StorefrontOfferStatus;
  readonly priority: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly discountType: StorefrontDiscountType;
  readonly discountValue: string;
  readonly minMarginPercent: string;
  readonly skus: readonly string[];
}

export interface StorefrontOfferDraft {
  readonly name: string;
  readonly status: StorefrontOfferStatus;
  readonly priority: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly discountType: StorefrontDiscountType;
  readonly discountValue: string;
  readonly minMarginPercent: string;
  readonly skusText: string;
}
