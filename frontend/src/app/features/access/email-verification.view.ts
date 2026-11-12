import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, OnChanges, Output, ViewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { VerificationStage } from '../../domain/access/email-verification';
import { EmailVerificationViewState } from './email-verification.store';

@Component({ selector: 'sc-email-verification-view', imports: [RouterLink], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="sc-page sc-auth" aria-labelledby="verify-title"><div class="sc-auth__card" [attr.aria-busy]="state.stage.busy">
    <header class="sc-page-head"><p class="sc-kicker">{{ state.realm.label }}</p><h1 #heading id="verify-title" tabindex="-1">Verificar mi correo</h1></header>
    <p role="status" aria-live="polite" aria-atomic="true">{{ state.stage === inspecting ? 'Comprobando enlace…' : state.stage === submitting ? 'Confirmando correo…' : state.outcome?.label }}</p>
    @if (state.stage === ready || state.stage === submitting) {
      <button type="button" class="sc-btn sc-btn--primary" [attr.aria-disabled]="state.stage !== ready" (click)="confirm.emit()">Confirmar mi correo</button>
    }
    <p>Esta confirmación no inicia sesión.</p>
    @if (state.profilePath) { <a class="sc-btn" routerLink="/login" [queryParams]="{ returnTo: state.loginDestination.wire, recoveredRealm: state.realm.wire }">Volver a mi cuenta</a> }
    <a class="sc-btn" routerLink="/login" [queryParams]="{ returnTo: state.loginDestination.wire, recoveredRealm: state.realm.wire }">Ingresar</a>
  </div></section>` })
export class EmailVerificationViewComponent implements AfterViewInit, OnChanges {
  @Input({ required: true }) state!: EmailVerificationViewState;
  @Output() readonly confirm = new EventEmitter<void>();
  @ViewChild('heading') private heading?: ElementRef<HTMLElement>;
  readonly ready = VerificationStage.Ready;
  readonly inspecting = VerificationStage.Inspecting;
  readonly submitting = VerificationStage.Submitting;
  ngAfterViewInit(): void { this.heading?.nativeElement.focus(); }
  ngOnChanges(): void { if (this.state.stage === VerificationStage.Result) this.heading?.nativeElement.focus(); }
}
