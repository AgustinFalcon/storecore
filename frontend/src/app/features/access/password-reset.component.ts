import { AsyncPipe, DOCUMENT } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RecoveryStore } from './recovery.store';
import { RecoveryViewComponent } from './recovery.view';

@Component({ selector: 'sc-password-reset', imports: [AsyncPipe, RecoveryViewComponent], providers: [RecoveryStore], template: `@if (store.state$ | async; as state) { <sc-recovery-view [reset]="true" [state]="state" (passwordChange)="store.setPassword($event)" (confirmationChange)="store.setConfirmation($event)" (submitForm)="store.submit()" (retryRequest)="store.retry()" /> }` })
export class PasswordResetComponent implements OnInit {
  readonly store = inject(RecoveryStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly destroy = inject(DestroyRef);
  private removingFragment = false;
  ngOnInit(): void {
    this.route.fragment.pipe(takeUntilDestroyed(this.destroy)).subscribe(fragment => {
      if (this.removingFragment && fragment === null) { this.removingFragment = false; return; }
      // Remove from the address bar before HTTP, then synchronize Angular's URL so
      // reopening the same link is not ignored as a same-URL navigation.
      const browser = this.document.defaultView;
      browser?.history.replaceState(null, '', this.document.location.pathname);
      this.store.initializeReset(fragment ?? '');
      if (fragment !== null) {
        this.removingFragment = true;
        void this.router.navigateByUrl('/reset-password', { replaceUrl: true });
      }
    });
  }
}
