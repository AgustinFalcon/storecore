import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AccessContext } from '../../domain/access/access-context';
import { ReturnDestination } from '../../domain/access/return-destination';
import { CaptureReturnDestinationStep } from './customer-registration-steps';
import { CustomerRegisterViewComponent } from './customer-register.view';
import { CustomerStore } from './customer.store';

@Component({
  selector: 'sc-customer-register',
  imports: [AsyncPipe, CustomerRegisterViewComponent],
  providers: [CustomerStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-customer-register-view
        [state]="state"
        [loginDestination]="destination"
        [authenticatedRoute]="authenticatedRoute"
        (firstNameChange)="store.setFirstName($event)"
        (lastNameChange)="store.setLastName($event)"
        (emailChange)="store.setEmail($event)"
        (passwordChange)="store.setPassword($event)"
        (submitRegister)="store.submitRegister()"
      />
    }
  `,
})
export class CustomerRegisterComponent implements OnInit {
  private readonly captureDestination = new CaptureReturnDestinationStep();
  destination = ReturnDestination.Unknown;
  authenticatedRoute = '/customer/profile';
  constructor(
    readonly store: CustomerStore,
    private readonly route: ActivatedRoute,
  ) {}
  ngOnInit(): void {
    this.destination = this.captureDestination.capture(this.route.snapshot.queryParamMap.get('returnTo'));
    this.authenticatedRoute = this.destination.routeFor(AccessContext.Customer) ?? '/customer/profile';
    this.store.setReturnDestination(this.destination);
    this.store.initializeRegistration();
  }
}
