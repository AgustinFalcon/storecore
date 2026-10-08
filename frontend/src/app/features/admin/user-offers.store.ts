import { Injectable } from '@angular/core';
import { UserSession } from '../../core/auth/user-session';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { filter, switchMap, takeUntil, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { isValidOfferWindow, toInstallationInstant } from '../../domain/catalog/offer-window';
import { DiscountType } from '../../domain/offer/discount-type';
import { OfferStatus } from '../../domain/offer/offer-status';
import { StorefrontOffer, StorefrontOfferDraft, StorefrontOfferWrite } from '../../domain/offer/storefront-offer.entity';
import { ManageStorefrontOffersUseCase } from '../../domain/offer/use-cases/manage-storefront-offers.usecase';

export interface UserOffersState {
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly offers: readonly StorefrontOffer[];
  readonly draft: StorefrontOfferDraft;
}

const emptyDraft: StorefrontOfferDraft = {
  name: '',
  status: OfferStatus.Draft,
  priority: 0,
  startsAt: '',
  endsAt: '',
  discountType: DiscountType.Percent,
  discountValue: '',
  minMarginPercent: '',
  skusText: '',
};

@Injectable()
export class UserOffersStore extends ComponentStore<UserOffersState> {
  constructor(private readonly offers: ManageStorefrontOffersUseCase, private readonly session: UserSession = new UserSession()) {
    super({
      loading: false,
      errorMessage: '',
      offers: [],
      draft: emptyDraft,
    });
    const initial = this.get();
    this.effect<void>(changes => changes.pipe(tap(() => {
      this.setState(initial);
    })))(session.actorChanges$);
  }

  get snapshot(): UserOffersState {
    return this.get((s) => s);
  }

  readonly setDraft = this.updater((s, draft: StorefrontOfferDraft) => ({ ...s, draft }));

  readonly loadOffers = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '' })),
      switchMap(() =>
        this.offers.list().pipe(
          takeUntil(this.session.actorChanges$),
          tapResponse({
            next: (offers) => this.patchState({ offers, loading: false }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly persistOffer = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => {
        const errorMessage = offerDraftError(this.snapshot.draft);
        if (errorMessage) {
          this.patchState({ loading: false, errorMessage });
          return;
        }
        this.patchState({ loading: true, errorMessage: '' });
      }),
      filter(() => offerDraftError(this.snapshot.draft) === ''),
      switchMap(() =>
        this.offers.save(offerForApi(this.snapshot.draft)).pipe(
          takeUntil(this.session.actorChanges$),
          tapResponse({
            next: () => {
              this.patchState({ draft: emptyDraft });
              this.loadOffers();
            },
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );
}

function offerSkus(skusText: string): string[] {
  return skusText
    .split(/[\s,;]+/)
    .map((sku) => sku.trim())
    .filter((sku) => sku.length > 0);
}

function isDecimal(value: string): boolean {
  return /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.trim());
}

function isPositiveDecimal(value: string): boolean {
  const trimmed = value.trim();
  return isDecimal(trimmed) && !/^0+(?:\.0+)?$/.test(trimmed);
}

function offerDraftError(draft: StorefrontOfferDraft): string {
  const skus = offerSkus(draft.skusText);
  if (!draft.name.trim() || !draft.startsAt.trim() || !draft.endsAt.trim() || !draft.discountValue.trim() || !draft.minMarginPercent.trim() || skus.length === 0) {
    return 'Nombre, vigencia, descuento, margen y al menos un SKU son obligatorios.';
  }
  if (!draft.status.writable) {
    return 'El estado tiene que ser borrador o activa.';
  }
  if (draft.discountType === DiscountType.Unknown) {
    return 'El descuento tiene que ser porcentaje o monto fijo.';
  }
  if (!isValidOfferWindow(draft.startsAt, draft.endsAt)) {
    return 'Hasta tiene que ser posterior a desde.';
  }
  if (!isPositiveDecimal(draft.discountValue)) {
    return 'El descuento tiene que ser mayor a cero. Esta pantalla no calcula precios.';
  }
  if (!isDecimal(draft.minMarginPercent)) {
    return 'El margen mínimo tiene que ser cero o mayor.';
  }
  return '';
}

function offerForApi(draft: StorefrontOfferDraft): StorefrontOfferWrite {
  return {
    name: draft.name.trim(),
    status: draft.status,
    priority: draft.priority,
    startsAt: toInstallationInstant(draft.startsAt),
    endsAt: toInstallationInstant(draft.endsAt),
    discountType: draft.discountType,
    discountValue: draft.discountValue.trim(),
    minMarginPercent: draft.minMarginPercent.trim(),
    skus: offerSkus(draft.skusText),
  };
}
