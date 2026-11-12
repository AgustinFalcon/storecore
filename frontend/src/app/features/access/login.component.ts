import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ReturnDestination } from '../../domain/access/return-destination';
import { AuthenticateRecoveredRealm } from '../../domain/access/recovery';
import { LoginStore } from './login.store';
import { LoginViewComponent } from './login.view';

@Component({
  selector: 'sc-login',
  imports: [AsyncPipe, LoginViewComponent],
  providers: [LoginStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (store.state$ | async; as state) {
    <sc-login-view [state]="state" [destination]="destination" (emailChange)="store.setEmail($event)" (passwordChange)="store.setPassword($event)" (submitCredentials)="store.submit()" (selectContext)="store.submit($event)" />
  }`,
})
export class LoginComponent implements OnInit {
  destination = ReturnDestination.Home;
  constructor(readonly store: LoginStore, private readonly route: ActivatedRoute) {}
  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.destination = ReturnDestination.fromWire(params.get('returnTo'));
    this.store.setRecoveryIntent(AuthenticateRecoveredRealm.fromWire(params.get('recoveredRealm')));
    this.store.initialize(this.destination);
  }
}
