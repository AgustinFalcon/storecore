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
  readonly promoDraft: ManualPromo;
}

const emptyPromo: ManualPromo = {
  id: '',
  listingSku: '',
  currency: 'ARS',
  validFrom: '',
  validTo: '',
  priority: 1,
  margin: 0,
  approvedBy: '',
  approvedAt: '',
  writer: 'MANUAL',
};

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
      promos: [],
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
  readonly setPromoDraft = this.updater((s, promoDraft: ManualPromo) => ({ ...s, promoDraft }));

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
        this.promos.list().pipe(
          tapResponse({
            next: (items) => this.patchState({ promos: items, loading: false }),
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
        if (!draft.listingSku.trim() || !draft.currency.trim() || !draft.validFrom || !draft.validTo) {
          this.patchState({ loading: false, errorMessage: 'SKU, moneda y vigencia son obligatorios.' });
          return;
        }
        this.patchState({ loading: true, errorMessage: '' });
      }),
      filter(() => {
        const draft = this.snapshot.promoDraft;
        return Boolean(draft.listingSku.trim() && draft.currency.trim() && draft.validFrom && draft.validTo);
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

}
