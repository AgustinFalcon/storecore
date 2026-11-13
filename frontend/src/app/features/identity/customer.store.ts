import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { exhaustMap, filter, Subject, switchMap, takeUntil, tap } from 'rxjs';
import { AddressReadState } from '../../domain/customer/address-read-state';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { CustomerSession } from '../../core/auth/customer-session';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { ContinueCustomerPurchaseIntentPolicy } from '../../core/auth/continue-customer-purchase-intent.policy';
import { AccessContext } from '../../domain/access/access-context';
import { ReturnDestination } from '../../domain/access/return-destination';
import { ContextAuthorityInspection } from '../../domain/access/session-probe';
import { CustomerAddress, CustomerProfile } from '../../domain/customer/customer.entity';
import { DeleteCustomerAddressUseCase } from '../../domain/customer/use-cases/delete-customer-address.usecase';
import { GetCustomerProfileUseCase } from '../../domain/customer/use-cases/get-customer-profile.usecase';
import { ListCustomerAddressesUseCase } from '../../domain/customer/use-cases/list-customer-addresses.usecase';
import { RegisterCustomerUseCase } from '../../domain/customer/use-cases/register-customer.usecase';
import { SaveCustomerAddressUseCase } from '../../domain/customer/use-cases/save-customer-address.usecase';
import { SaveCustomerProfileUseCase } from '../../domain/customer/use-cases/save-customer-profile.usecase';
import { SignInCustomerUseCase } from '../../domain/customer/use-cases/sign-in-customer.usecase';
import { SignOutCustomerUseCase } from '../../domain/customer/use-cases/sign-out-customer.usecase';
import { CompleteCustomerRegistrationStep, CustomerRegistrationStage, InspectRegisteredCustomerStep, ReconcileRegisteredCustomerStep } from './customer-registration-steps';

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
  readonly profileRevision: number;
  readonly addresses: readonly CustomerAddress[];
  readonly addressDraft: CustomerAddress;
  readonly addressReadState: AddressReadState;
  readonly addressMutationPending: boolean;
  readonly registrationStage: CustomerRegistrationStage;
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
  profileRevision: 0,
  addresses: [],
  addressDraft: emptyAddress,
  addressReadState: AddressReadState.Idle,
  addressMutationPending: false,
  registrationStage: CustomerRegistrationStage.Capture,
};

@Injectable()
export class CustomerStore extends ComponentStore<CustomerState> {
  private addressGeneration = 0;
  private readonly addressCanceled = new Subject<void>();
  private readonly reconcileRegistration: ReconcileRegisteredCustomerStep;
  private readonly inspectRegistration: InspectRegisteredCustomerStep;
  private readonly completeRegistration = new CompleteCustomerRegistrationStep();
  private returnDestination = ReturnDestination.Unknown;
  private resume: string | null = null;
  setResumeReference(raw: unknown): string | null { return this.resume = this.continuation.reference(raw); }
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
    access: AccessCoordinator,
    private readonly router: Router,
    private readonly continuation: ContinueCustomerPurchaseIntentPolicy,
  ) {
    super({ ...INITIAL, authenticated: session.authenticated() });
    this.reconcileRegistration = new ReconcileRegisteredCustomerStep(access);
    this.inspectRegistration = new InspectRegisteredCustomerStep(access);
    this.effect<string | null>((actors$) => actors$.pipe(tap(() => {
      this.invalidateAddresses();
      this.patchState({ addresses: [], addressDraft: emptyAddress, addressReadState: AddressReadState.Idle,
        addressMutationPending: false, loading: false, errorMessage: '', authenticated: session.authenticated() });
    })))(session.actorChanges$);
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
  setReturnDestination(destination: ReturnDestination): void { this.returnDestination = destination; }
  readonly initializeRegistration = this.effect<void>((trigger$) => trigger$.pipe(exhaustMap(() => this.inspectExistingRegistration())));
  private inspectExistingRegistration() {
    this.patchState({ loading: true, errorMessage: '', registrationStage: CustomerRegistrationStage.Inspecting });
    return this.inspectRegistration.execute().pipe(tapResponse({
      next: (inspection) => {
        this.patchState({ loading: false, registrationStage: inspection === ContextAuthorityInspection.Accepted
        ? CustomerRegistrationStage.Complete : inspection === ContextAuthorityInspection.Absent
          ? CustomerRegistrationStage.Capture : CustomerRegistrationStage.InspectionRequired,
        errorMessage: inspection === ContextAuthorityInspection.Unavailable ? 'No pudimos comprobar la sesión actual. Reintentá antes de crear otra cuenta.' : '' });
        if (inspection === ContextAuthorityInspection.Accepted && this.resume) this.navigateAfterRegistration();
      },
      error: () => this.patchState({ loading: false, registrationStage: CustomerRegistrationStage.InspectionRequired,
        errorMessage: 'No pudimos comprobar la sesión actual. Reintentá antes de crear otra cuenta.' }),
    }));
  }
  readonly setProfile = this.updater((s, profile: CustomerProfile) => ({ ...s, profile, saved: false }));
  readonly setAddressDraft = this.updater((s, addressDraft: CustomerAddress) => ({ ...s, addressDraft }));
  readonly clearAddressDraft = this.updater((s) => ({ ...s, addressDraft: emptyAddress }));

  readonly submitRegister = this.effect<void>((trigger$) =>
    trigger$.pipe(
      exhaustMap(() => {
        if (this.snapshot.registrationStage === CustomerRegistrationStage.InspectionRequired) return this.inspectExistingRegistration();
        if (this.snapshot.registrationStage === CustomerRegistrationStage.ReconcileRequired) return this.finishRegistration();
        return this.createRegistration();
      }),
    ),
  );

  private createRegistration() {
    const valid = Boolean(this.snapshot.email && this.snapshot.password && this.snapshot.firstName && this.snapshot.lastName);
    if (!valid) {
      this.patchState({ loading: false, errorMessage: 'Nombre, apellido, email y contraseña son obligatorios.' });
      return [];
    }
    this.patchState({ loading: true, errorMessage: '', registrationStage: CustomerRegistrationStage.Submitting });
    return this.register.execute({
      email: this.snapshot.email,
      password: this.snapshot.password,
      firstName: this.snapshot.firstName,
      lastName: this.snapshot.lastName,
    }).pipe(
      switchMap(() => {
        this.patchState({ password: '', registrationStage: CustomerRegistrationStage.ReconcileRequired });
        return this.finishRegistration();
      }),
      tapResponse({
        next: () => undefined,
        error: (err: unknown) => this.patchState({ loading: false, registrationStage: CustomerRegistrationStage.Capture, errorMessage: getApiErrorMessage(err) }),
      }),
    );
  }

  private finishRegistration() {
    this.patchState({ loading: true, errorMessage: '', registrationStage: CustomerRegistrationStage.Reconciling });
    return this.reconcileRegistration.execute().pipe(
      tapResponse({
        next: (accepted) => {
          if (!accepted) {
            this.patchState({ loading: false, registrationStage: CustomerRegistrationStage.ReconcileRequired,
              errorMessage: 'La cuenta fue creada, pero no pudimos confirmar la sesión. Reintentá sin volver a registrarte.' });
            return;
          }
          this.patchState({ loading: false, authenticated: this.session.authenticated(), registrationStage: CustomerRegistrationStage.Complete });
          this.navigateAfterRegistration();
        },
        error: () => this.patchState({ loading: false, registrationStage: CustomerRegistrationStage.ReconcileRequired,
          errorMessage: 'La cuenta fue creada, pero no pudimos confirmar la sesión. Reintentá sin volver a registrarte.' }),
      }),
    );
  }

  private navigateAfterRegistration(): void {
    const route = this.completeRegistration.route(this.returnDestination);
    void this.router.navigateByUrl(this.continuation.route(AccessContext.Customer, this.returnDestination, route, this.resume));
  }

  /* Legacy sign-in remains separate from unified access while callers migrate. */
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
            next: (profile) => this.patchState({ profile, loading: false, saved: false, profileRevision: this.snapshot.profileRevision + 1 }),
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
            next: (profile) => this.patchState({ profile, loading: false, saved: true, errorMessage: '', profileRevision: this.snapshot.profileRevision + 1 }),
            // A lost response can follow a committed email change. Re-read
            // ownership even when saving could not be confirmed locally.
            error: (err: unknown) => this.patchState({ loading: false, saved: false, errorMessage: getApiErrorMessage(err), profileRevision: this.snapshot.profileRevision + 1 }),
          }),
        ),
      ),
    ),
  );

  readonly loadAddresses = this.effect<void>((trigger$) =>
    trigger$.pipe(
      filter(() => this.session.actorIdentity() !== null && !this.snapshot.addressMutationPending),
      switchMap(() => {
        const generation = this.invalidateAddresses();
        this.patchState({ loading: true, errorMessage: '', addressReadState: AddressReadState.Loading });
        return this.listAddresses.execute().pipe(
          takeUntil(this.addressCanceled),
          tapResponse({
            next: (addresses) => {
              if (generation !== this.addressGeneration) return;
              this.patchState({ addresses, loading: false, addressReadState: addresses.length ? AddressReadState.Ready : AddressReadState.Empty });
            },
            error: (err: unknown) => {
              if (generation !== this.addressGeneration) return;
              this.patchState({ loading: false, errorMessage: getApiErrorMessage(err), addressReadState: AddressReadState.Error });
            },
          }),
        );
      }),
    ),
  );

  readonly persistAddress = this.effect<void>((trigger$) =>
    trigger$.pipe(
      filter(() => this.session.actorIdentity() !== null && !this.snapshot.addressMutationPending),
      tap(() => {
        const draft = this.snapshot.addressDraft;
        if (!draft.street.trim() || !draft.number.trim() || !draft.city.trim() || !draft.province.trim() || !draft.postalCode.trim()) {
          this.patchState({ loading: false, errorMessage: 'Calle, número, ciudad, provincia y CP son obligatorios.' });
          return;
        }
      }),
      filter(() => {
        const draft = this.snapshot.addressDraft;
        return Boolean(draft.street.trim() && draft.number.trim() && draft.city.trim() && draft.province.trim() && draft.postalCode.trim());
      }),
      switchMap(() => {
        const generation = this.invalidateAddresses();
        this.patchState({ loading: true, errorMessage: '', addressMutationPending: true, addressReadState: AddressReadState.Idle });
        return this.saveAddress.execute(this.snapshot.addressDraft).pipe(
          takeUntil(this.addressCanceled),
          tapResponse({
            next: () => {
              if (generation !== this.addressGeneration) return;
              this.patchState({ addressDraft: emptyAddress, addressMutationPending: false });
              this.loadAddresses();
            },
            error: (err: unknown) => {
              if (generation !== this.addressGeneration) return;
              this.patchState({ loading: false, addressMutationPending: false, addressReadState: AddressReadState.Error, errorMessage: getApiErrorMessage(err) });
            },
          }),
        );
      }),
    ),
  );

  readonly removeAddress = this.effect<string>((id$) =>
    id$.pipe(
      filter((id) => Boolean(id.trim()) && this.session.actorIdentity() !== null && !this.snapshot.addressMutationPending),
      switchMap((id) => {
        const generation = this.invalidateAddresses();
        this.patchState({ loading: true, errorMessage: '', addressMutationPending: true, addressReadState: AddressReadState.Idle });
        return this.deleteAddress.execute(id).pipe(
          takeUntil(this.addressCanceled),
          tapResponse({
            next: () => {
              if (generation !== this.addressGeneration) return;
              this.patchState({ addressDraft: emptyAddress, addressMutationPending: false });
              this.loadAddresses();
            },
            error: (err: unknown) => {
              if (generation !== this.addressGeneration) return;
              this.patchState({ loading: false, addressMutationPending: false, addressReadState: AddressReadState.Error, errorMessage: getApiErrorMessage(err) });
            },
          }),
        );
      }),
    ),
  );

  private invalidateAddresses(): number {
    ++this.addressGeneration;
    this.addressCanceled.next();
    return this.addressGeneration;
  }

  readonly signOut = this.effect<void>((trigger$) =>
    trigger$.pipe(
      switchMap(() =>
        this.signOutCustomer.execute().pipe(
          tapResponse({
            next: () => {
              this.setState({ ...INITIAL });
              void this.router.navigateByUrl('/login');
            },
            error: () => {
              this.setState({ ...INITIAL });
              void this.router.navigateByUrl('/login');
            },
          }),
        ),
      ),
    ),
  );
}
