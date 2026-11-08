import { CreateManualPromo, PolicyStatus, PolicyTransition, PriceCurrency, PriceScope, PriceWriter } from '../../domain/user/channel-pricing';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { filter, switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { UserSession } from '../../core/auth/user-session';
import { ManualPromo } from '../../domain/user/user.entity';
import { ManagePromosUseCase } from '../../domain/user/use-cases/manage-promos.usecase';
import { SignInUserUseCase } from '../../domain/user/use-cases/sign-in-user.usecase';
import { SignOutUserUseCase } from '../../domain/user/use-cases/sign-out-user.usecase';

export interface UserState {
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly authenticated: boolean;
  readonly email: string;
  readonly password: string;
  readonly promos: readonly ManualPromo[];
  readonly promoDraft: CreateManualPromo;
  readonly page: number;
  readonly total: number;
}

const emptyPromo: CreateManualPromo = { listingSku: '', currency: PriceCurrency.Ars, priceScope: PriceScope.Default, desiredPrice: 0, effectivePromoPrice: null, validFrom: '', validTo: '', writer: PriceWriter.Manual };

@Injectable()
export class UserStore extends ComponentStore<UserState> {
  constructor(
    private readonly signIn: SignInUserUseCase,
    private readonly signOutUser: SignOutUserUseCase,
    private readonly promos: ManagePromosUseCase,
    private readonly session: UserSession,
    private readonly router: Router,
  ) {
    super({
      loading: false,
      errorMessage: '',
      authenticated: session.authenticated(),
      email: '',
      password: '',
      promos: [], page: 0, total: 0,
      promoDraft: emptyPromo,
    });
  }

  get snapshot(): UserState {
    return this.get((s) => s);
  }

  readonly loading$ = this.select((s) => s.loading);
  readonly errorMessage$ = this.select((s) => s.errorMessage);
  readonly authenticated$ = this.select((s) => s.authenticated);
  readonly promos$ = this.select((s) => s.promos);

  readonly setEmail = this.updater((s, email: string) => ({ ...s, email }));
  readonly setPassword = this.updater((s, password: string) => ({ ...s, password }));
  readonly setPromoDraft = this.updater((s, promoDraft: CreateManualPromo) => ({ ...s, promoDraft }));

  readonly submitSignIn = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => {
        if (!this.snapshot.email || !this.snapshot.password) {
          this.patchState({ loading: false, errorMessage: 'Email y contraseña son obligatorios.' });
          return;
        }
        this.patchState({ loading: true, errorMessage: '' });
      }),
      filter(() => Boolean(this.snapshot.email && this.snapshot.password)),
      switchMap(() =>
        this.signIn.execute({ email: this.snapshot.email, password: this.snapshot.password }).pipe(
            tapResponse({
            next: () => {
              this.patchState({ loading: false, authenticated: this.session.authenticated(), password: '' });
              void this.router.navigateByUrl('/user/home');
            },
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly signOut = this.effect<void>((trigger$) =>
    trigger$.pipe(
      switchMap(() =>
        this.signOutUser.execute().pipe(
          tapResponse({
            next: () => {
              this.patchState({
                authenticated: false,
                email: '',
                password: '',
                errorMessage: '',
              });
              void this.router.navigateByUrl('/login');
            },
            error: () => {
              this.patchState({
                authenticated: false,
                email: '',
                password: '',
                errorMessage: '',
              });
              void this.router.navigateByUrl('/login');
            },
          }),
        ),
      ),
    ),
  );

  readonly loadPromos = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '' })),
      switchMap(() =>
        this.promos.list(this.snapshot.page).pipe(
          tapResponse({
            next: (items) => this.patchState({ promos: items, page: items.metadata.page, total: items.metadata.total, loading: false }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly persistPromo = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => {
        const draft = this.snapshot.promoDraft;
        if (!draft.listingSku.trim() || draft.currency === PriceCurrency.Unknown || !draft.validFrom || !draft.validTo) {
          this.patchState({ loading: false, errorMessage: 'SKU, moneda y vigencia son obligatorios.' });
          return;
        }
        this.patchState({ loading: true, errorMessage: '' });
      }),
      filter(() => {
        const draft = this.snapshot.promoDraft;
        return Boolean(draft.listingSku.trim() && draft.currency !== PriceCurrency.Unknown && draft.validFrom && draft.validTo);
      }),
      switchMap(() =>
        this.promos.save(this.snapshot.promoDraft).pipe(
          tapResponse({
            next: () => {
              this.patchState({ promoDraft: emptyPromo });
              this.loadPromos();
            },
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  goToPage(page: number): void { if (!Number.isInteger(page) || page < 0 || page > 10000) return; this.patchState({ page }); this.loadPromos(); }
  readonly transitionPromo = this.effect<{ promo: ManualPromo; transition: PolicyTransition }>(requests => requests.pipe(
    filter(({ promo, transition }) => promo.status !== PolicyStatus.Unknown && promo.priceScope !== PriceScope.Unknown && promo.writer !== PriceWriter.Unknown && promo.currency !== PriceCurrency.Unknown && PolicyTransition.for(promo.status).includes(transition)),
    tap(() => this.patchState({ loading: true, errorMessage: '' })),
    switchMap(({ promo, transition }) => this.promos.transition(promo.id, transition).pipe(tapResponse({
      next: () => this.loadPromos(), error: (error: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(error) }),
    }))),
  ));

}
