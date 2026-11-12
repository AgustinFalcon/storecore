import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { EmailOwnership } from '../../domain/access/email-verification';
import { EmailOwnershipViewState } from './email-ownership.store';

@Component({
  selector: 'sc-email-ownership-view', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section aria-labelledby="email-ownership-title" [attr.aria-busy]="state.loading || state.request.busy">
    <h2 id="email-ownership-title">Verificación del correo</h2>
    <p role="status" aria-live="polite">{{ state.ownership.label }}{{ state.loading ? ' · Consultando…' : '' }}</p>
    <p>Confirmar tu correo permite solicitar recuperación de acceso cuando el servicio esté disponible.</p>
    @if (state.ownership !== verified) {
      <p role="status" aria-live="polite" aria-atomic="true">{{ state.request.label }}</p>
      <button type="button" class="sc-btn sc-btn--primary" [attr.aria-disabled]="!state.canRequest || state.loading || state.request.busy || state.retrySeconds > 0" (click)="request.emit()">Solicitar verificación</button>
      @if (state.retrySeconds > 0) { <p>Podés repetir la solicitud en {{ state.retrySeconds }} segundos.</p> }
    }
    <button type="button" class="sc-btn" [disabled]="state.loading" (click)="refresh.emit()">Actualizar estado del correo</button>
  </section>`,
})
export class EmailOwnershipViewComponent {
  @Input({ required: true }) state!: EmailOwnershipViewState;
  @Output() readonly request = new EventEmitter<void>();
  @Output() readonly refresh = new EventEmitter<void>();
  readonly verified = EmailOwnership.Verified;
}
