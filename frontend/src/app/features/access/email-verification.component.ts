import { AsyncPipe, DOCUMENT } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, NavigationSkipped, Router } from '@angular/router';
import { filter } from 'rxjs';
import { VerificationFragmentState } from '../../domain/access/email-verification';
import { EmailVerificationStore } from './email-verification.store';
import { EmailVerificationViewComponent } from './email-verification.view';

@Component({ selector: 'sc-email-verification', imports: [AsyncPipe, EmailVerificationViewComponent], providers: [EmailVerificationStore],
  template: `@if (store.state$ | async; as state) { <sc-email-verification-view [state]="state" (confirm)="store.confirm()" /> }` })
export class EmailVerificationComponent implements OnInit {
  readonly store = inject(EmailVerificationStore);
  private readonly document = inject(DOCUMENT);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private captureState = VerificationFragmentState.Waiting;
  ngOnInit(): void {
    this.route.fragment.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => this.capture());
    this.router.events.pipe(filter(event => event instanceof NavigationEnd || event instanceof NavigationSkipped), takeUntilDestroyed(this.destroy)).subscribe(() => this.capture());
  }
  private capture(): void {
    const fragment = this.document.location.hash;
    if (!this.captureState.accepts(fragment)) return;
    this.captureState = VerificationFragmentState.Captured;
    // Sanitization precedes parsing and every network operation. The router's
    // cached fragment is never a source of tokens after this boundary.
    this.document.defaultView?.history.replaceState(null, '', this.document.location.pathname);
    this.store.initialize(fragment);
  }
}
