import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { filter, switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { CustomerSession } from '../../core/auth/customer-session';
import { CustomerAddress, CustomerProfile } from '../../domain/customer/customer.entity';
import { DeleteCustomerAddressUseCase } from '../../domain/customer/use-cases/delete-customer-address.usecase';
import { GetCustomerProfileUseCase } from '../../domain/customer/use-cases/get-customer-profile.usecase';
import { ListCustomerAddressesUseCase } from '../../domain/customer/use-cases/list-customer-addresses.usecase';
import { RegisterCustomerUseCase } from '../../domain/customer/use-cases/register-customer.usecase';
import { SaveCustomerAddressUseCase } from '../../domain/customer/use-cases/save-customer-address.usecase';
import { SaveCustomerProfileUseCase } from '../../domain/customer/use-cases/save-customer-profile.usecase';
import { SignInCustomerUseCase } from '../../domain/customer/use-cases/sign-in-customer.usecase';
import { SignOutCustomerUseCase } from '../../domain/customer/use-cases/sign-out-customer.usecase';

export interface CustomerState {
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly authenticated: boolean;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly password: string;
  readonly profile: CustomerProfile;
  readonly saved: boolean;
  readonly addresses: readonly CustomerAddress[];
  readonly addressDraft: CustomerAddress;
}

const emptyProfile: CustomerProfile = { email: '', firstName: '', lastName: '', phone: '' };
const emptyAddress: CustomerAddress = {
  id: '',
  street: '',
  number: '',
  city: '',
  province: '',
  postalCode: '',
  isDefault: false,
};

const INITIAL: CustomerState = {
  loading: false,
  errorMessage: '',
  authenticated: false,
  email: '',
  firstName: '',
  lastName: '',
  password: '',
  profile: emptyProfile,
  saved: false,
  addresses: [],
  addressDraft: emptyAddress,
};

@Injectable()
export class CustomerStore extends ComponentStore<CustomerState> {
  constructor(
    private readonly register: RegisterCustomerUseCase,
    private readonly signIn: SignInCustomerUseCase,
    private readonly signOutCustomer: SignOutCustomerUseCase,
    private readonly getProfile: GetCustomerProfileUseCase,
    private readonly saveProfile: SaveCustomerProfileUseCase,
    private readonly listAddresses: ListCustomerAddressesUseCase,
    private readonly saveAddress: SaveCustomerAddressUseCase,
    private readonly deleteAddress: DeleteCustomerAddressUseCase,
    private readonly session: CustomerSession,
    private readonly router: Router,
  ) {
    super({ ...INITIAL, authenticated: session.authenticated() });
  }

  get snapshot(): CustomerState {
    return this.get((s) => s);
  }

  readonly loading$ = this.select((s) => s.loading);
  readonly errorMessage$ = this.select((s) => s.errorMessage);
  readonly profile$ = this.select((s) => s.profile);
  readonly addresses$ = this.select((s) => s.addresses);
  readonly authenticated$ = this.select((s) => s.authenticated);

  readonly setEmail = this.updater((s, email: string) => ({ ...s, email }));
  readonly setFirstName = this.updater((s, firstName: string) => ({ ...s, firstName }));
  readonly setLastName = this.updater((s, lastName: string) => ({ ...s, lastName }));
  readonly setPassword = this.updater((s, password: string) => ({ ...s, password }));
  readonly setProfile = this.updater((s, profile: CustomerProfile) => ({ ...s, profile, saved: false }));
  readonly setAddressDraft = this.updater((s, addressDraft: CustomerAddress) => ({ ...s, addressDraft }));
  readonly clearAddressDraft = this.updater((s) => ({ ...s, addressDraft: emptyAddress }));

  readonly submitRegister = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => {
        if (!this.snapshot.email || !this.snapshot.password || !this.snapshot.firstName || !this.snapshot.lastName) {
          this.patchState({ loading: false, errorMessage: 'Nombre, apellido, email y contraseña son obligatorios.' });
          return;
        }
        this.patchState({ loading: true, errorMessage: '' });
      }),
      filter(() => Boolean(this.snapshot.email && this.snapshot.password && this.snapshot.firstName && this.snapshot.lastName)),
      switchMap(() =>
        this.register
          .execute({
            email: this.snapshot.email,
            password: this.snapshot.password,
            firstName: this.snapshot.firstName,
            lastName: this.snapshot.lastName,
          })
          .pipe(
            tapResponse({
              next: () => {
                this.patchState({ loading: false, authenticated: this.session.authenticated(), password: '' });
                void this.router.navigateByUrl('/customer/profile');
              },
              error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
            }),
          ),
      ),
    ),
  );

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
              void this.router.navigateByUrl('/customer/profile');
            },
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly loadProfile = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '' })),
      switchMap(() =>
        this.getProfile.execute().pipe(
          tapResponse({
            next: (profile) => this.patchState({ profile, loading: false, saved: false }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly persistProfile = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => {
        if (!this.snapshot.profile.firstName.trim() || !this.snapshot.profile.lastName.trim() || !this.snapshot.profile.email.trim()) {
          this.patchState({ loading: false, errorMessage: 'Nombre, apellido y email son obligatorios.' });
          return;
        }
        this.patchState({ loading: true, errorMessage: '' });
      }),
      filter(() =>
        Boolean(this.snapshot.profile.firstName.trim() && this.snapshot.profile.lastName.trim() && this.snapshot.profile.email.trim()),
      ),
      switchMap(() =>
        this.saveProfile.execute(this.snapshot.profile).pipe(
          tapResponse({
            next: (profile) => this.patchState({ profile, loading: false, saved: true, errorMessage: '' }),
            error: (err: unknown) => this.patchState({ loading: false, saved: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly loadAddresses = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '' })),
      switchMap(() =>
        this.listAddresses.execute().pipe(
          tapResponse({
            next: (addresses) => this.patchState({ addresses, loading: false }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly persistAddress = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => {
        const draft = this.snapshot.addressDraft;
        if (!draft.street.trim() || !draft.number.trim() || !draft.city.trim() || !draft.province.trim() || !draft.postalCode.trim()) {
          this.patchState({ loading: false, errorMessage: 'Calle, número, ciudad, provincia y CP son obligatorios.' });
          return;
        }
        this.patchState({ loading: true, errorMessage: '' });
      }),
      filter(() => {
        const draft = this.snapshot.addressDraft;
        return Boolean(draft.street.trim() && draft.number.trim() && draft.city.trim() && draft.province.trim() && draft.postalCode.trim());
      }),
      switchMap(() =>
        this.saveAddress.execute(this.snapshot.addressDraft).pipe(
          tapResponse({
            next: () => {
              this.patchState({ addressDraft: emptyAddress });
              this.loadAddresses();
            },
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly removeAddress = this.effect<string>((id$) =>
    id$.pipe(
      filter((id) => Boolean(id.trim())),
      tap(() => this.patchState({ loading: true, errorMessage: '' })),
      switchMap((id) =>
        this.deleteAddress.execute(id).pipe(
          tapResponse({
            next: () => {
              this.patchState({ addressDraft: emptyAddress });
              this.loadAddresses();
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
        this.signOutCustomer.execute().pipe(
          tapResponse({
            next: () => {
              this.setState({ ...INITIAL });
              void this.router.navigateByUrl('/customer/session');
            },
            error: () => {
              this.setState({ ...INITIAL });
              void this.router.navigateByUrl('/customer/session');
            },
          }),
        ),
      ),
    ),
  );
}
