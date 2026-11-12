import { AsyncPipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReturnDestination } from '../../domain/access/return-destination';
import { RecoveryStore } from './recovery.store';
import { RecoveryViewComponent } from './recovery.view';

@Component({ selector: 'sc-recovery', imports: [AsyncPipe, RecoveryViewComponent], providers: [RecoveryStore], template: `@if (store.state$ | async; as state) { <sc-recovery-view [state]="state" [destination]="destination" (realmChange)="store.setRealm($event)" (emailChange)="store.setEmail($event)" (submitForm)="store.submit()" (retryRequest)="store.retry()" /> }` })
export class RecoveryComponent implements OnInit {
  readonly store = inject(RecoveryStore);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  destination = ReturnDestination.Home;
  ngOnInit(): void { this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroy)).subscribe(params => { const destination = ReturnDestination.fromWire(params.get('returnTo')); this.destination = destination === ReturnDestination.Unknown ? ReturnDestination.Home : destination; this.store.initializeRequest(); }); }
}
