import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { concatMap, filter, switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { CreateOfferCommand, Offer, OfferTransition } from '../../domain/offer/offer';
import { CreateOfferUseCase } from '../../domain/offer/use-cases/create-offer.usecase';
import { ListOffersUseCase } from '../../domain/offer/use-cases/list-offers.usecase';
import { TransitionOfferUseCase } from '../../domain/offer/use-cases/transition-offer.usecase';

export interface UserOffersState {
  readonly loading: boolean;
  readonly mutatingId: number;
  readonly creating: boolean;
  readonly offers: readonly Offer[];
  readonly errorMessage: string;
  readonly feedback: string;
}

const INITIAL: UserOffersState = { loading: false, mutatingId: 0, creating: false, offers: [], errorMessage: '', feedback: '' };

@Injectable()
export class UserOffersStore extends ComponentStore<UserOffersState> {
  readonly viewState$ = this.select((state) => state);
  constructor(
    private readonly listOffers: ListOffersUseCase,
    private readonly createOffer: CreateOfferUseCase,
    private readonly transitionOffer: TransitionOfferUseCase,
  ) { super(INITIAL); }

  readonly load = this.effect<void>((trigger$) => trigger$.pipe(
    tap(() => this.patchState({ loading: true, errorMessage: '', feedback: '' })),
    switchMap(() => this.listOffers.execute().pipe(tapResponse({
      next: (offers) => this.patchState({ offers, loading: false }),
      error: (error: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(error) }),
    }))),
  ));

  readonly create = this.effect<CreateOfferCommand>((command$) => command$.pipe(
    tap(() => this.patchState({ creating: true, errorMessage: '', feedback: '' })),
    concatMap((command) => this.createOffer.execute(command).pipe(tapResponse({
      next: (offer) => this.patchState((state) => ({ creating: false, offers: [...state.offers, offer], feedback: 'Borrador creado. Revisalo antes de activarlo.' })),
      error: (error: unknown) => this.patchState({ creating: false, errorMessage: getApiErrorMessage(error) }),
    }))),
  ));

  readonly transition = this.effect<{ offer: Offer; transition: OfferTransition }>((request$) => request$.pipe(
    filter(({ offer, transition }) => offer.id > 0 && OfferTransition.forOffer(offer).includes(transition)),
    tap(({ offer }) => this.patchState({ mutatingId: offer.id, errorMessage: '', feedback: '' })),
    concatMap(({ offer, transition }) => this.transitionOffer.execute(offer.id, transition).pipe(tapResponse({
      next: (updated) => this.patchState((state) => ({
        mutatingId: 0,
        offers: state.offers.map((offer) => offer.id === updated.id ? updated : offer),
        feedback: `Oferta ${transition.label.toLocaleLowerCase()} correctamente.`,
      })),
      error: (error: unknown) => this.patchState({ mutatingId: 0, errorMessage: getApiErrorMessage(error) }),
    }))),
  ));
}
