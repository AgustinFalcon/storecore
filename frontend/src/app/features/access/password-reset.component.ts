import { AsyncPipe, DOCUMENT } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { ActivatedRoute, NavigationEnd, NavigationSkipped, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { RecoveryStore } from './recovery.store';
import { RecoveryViewComponent } from './recovery.view';

/** Empty route emissions after capture belong to URL sanitization, not a new link. */
class ResetFragmentCaptureState {
  private constructor(readonly wire: string) {}
  static readonly Waiting = new ResetFragmentCaptureState('WAITING');
  static readonly Consumed = new ResetFragmentCaptureState('CONSUMED');
  static readonly Unknown = new ResetFragmentCaptureState('');
  static fromWire(raw: unknown): ResetFragmentCaptureState { return [this.Waiting, this.Consumed].find(value => value.wire === raw) ?? this.Unknown; }
  accepts(fragment: string): boolean { return this === ResetFragmentCaptureState.Waiting || this === ResetFragmentCaptureState.Consumed && fragment.length > 0; }
}

@Component({ selector: 'sc-password-reset', imports: [AsyncPipe, RecoveryViewComponent], providers: [RecoveryStore], template: `@if (store.state$ | async; as state) { <sc-recovery-view [reset]="true" [state]="state" (passwordChange)="store.setPassword($event)" (confirmationChange)="store.setConfirmation($event)" (submitForm)="store.submit()" (retryRequest)="store.retry()" /> }` })
export class PasswordResetComponent implements OnInit {
  readonly store = inject(RecoveryStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly destroy = inject(DestroyRef);
  private captureState = ResetFragmentCaptureState.Waiting;
  ngOnInit(): void {
    this.route.fragment.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => this.captureCurrentFragment());
    // Reopening a consumed link can be skipped by Angular's stale internal URL.
    // Observe that event without starting another navigation or recreating the view.
    this.router.events.pipe(filter(event => event instanceof NavigationEnd || event instanceof NavigationSkipped), takeUntilDestroyed(this.destroy)).subscribe(() => this.captureCurrentFragment());
  }
  private captureCurrentFragment(): void {
    // The address bar is the boundary. ActivatedRoute may still contain a secret
    // already removed by a previous component instance and must not replay it.
    const captured = this.document.location.hash.replace(/^#/, '');
    if (!this.captureState.accepts(captured)) return;
    this.captureState = ResetFragmentCaptureState.Consumed;
    this.document.defaultView?.history.replaceState(null, '', this.document.location.pathname);
    this.store.initializeReset(captured);
  }
}
