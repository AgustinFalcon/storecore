import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ReturnDestination } from '../../domain/access/return-destination';
import { LoginStore } from './login.store';
import { LoginViewComponent } from './login.view';

@Component({
  selector: 'sc-login',
  imports: [AsyncPipe, LoginViewComponent],
  providers: [LoginStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (store.state$ | async; as state) {
    <sc-login-view [state]="state" (emailChange)="store.setEmail($event)" (passwordChange)="store.setPassword($event)" (submitCredentials)="store.submit()" (selectContext)="store.submit($event)" />
  }`,
})
export class LoginComponent implements OnInit {
  constructor(readonly store: LoginStore, private readonly route: ActivatedRoute) {}
  ngOnInit(): void { this.store.initialize(ReturnDestination.fromWire(this.route.snapshot.queryParamMap.get('returnTo'))); }
}
