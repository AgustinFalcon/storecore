import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NotificationDetailStore } from './notification-detail.store';
import { NotificationTransitionIntent } from '../../domain/notification/notification';
import { NotificationLoadState, NotificationStep } from '../../domain/notification/notification-types';
@Component({
  selector: 'sc-notification-detail-view', imports: [FormsModule, RouterLink, DatePipe], changeDetection: ChangeDetectionStrategy.OnPush, styleUrl: './notifications.css',
  styles: [`.notification-confirmation{margin-top:1rem;padding:1rem;border:2px solid var(--sc-border,#667085);border-radius:.75rem;background:var(--sc-surface,#fff)}`],
  template: `<section class="notifications" aria-labelledby="notification-detail-title"><a routerLink="/user/notifications" [queryParams]="backQuery()">Volver al centro de notificaciones</a><h1 id="notification-detail-title">Detalle de notificación</h1>
    <p role="status" aria-live="polite">{{state().status.label}}</p><button type="button" [disabled]="state().status === states.Loading || state().busy" (click)="reload.emit()">Actualizar detalle</button>
    @if (state().alert; as alert) {
      <article class="notification-detail" [attr.aria-busy]="state().status === states.Loading"><h2>{{alert.category.label}} · {{alert.severity.label}}</h2><dl><dt>Estado</dt><dd>{{alert.lifecycle.label}}</dd><dt>Origen</dt><dd>{{alert.source.label}}</dd><dt>Identificador de origen</dt><dd class="notification-identifier">{{alert.sourceId}}</dd><dt>Creada</dt><dd>{{alert.createdAt | date:'medium'}}</dd><dt>Revisión actual</dt><dd>{{alert.revision.wire}}</dd><dt>Identificador de alerta</dt><dd class="notification-identifier">{{alert.id.wire}}</dd><dt>Huella del episodio</dt><dd class="notification-identifier">{{alert.fingerprint}}</dd></dl></article>
      @if (admin()) { <section aria-labelledby="notification-command-title"><h2 id="notification-command-title">Cambiar estado</h2><p>Cada acción registra tu usuario, fecha, motivo y revisión. Abrir este detalle no reconoce ni resuelve la alerta.</p><label for="notification-reason">Motivo obligatorio (hasta 500 caracteres Unicode)</label><textarea id="notification-reason" name="reason" rows="4" [ngModel]="reason()" (ngModelChange)="reason.set($event)" [disabled]="state().busy || state().recovery.locked || pending() !== null" ></textarea><div class="notification-actions">@for (step of alert.operations; track step.wire) { <button type="button" [disabled]="state().busy || state().recovery.locked || state().status !== states.Ready || pending() !== null || !reason().trim()" (click)="review(step)">{{step.label}}</button> }</div>@if (!alert.operations.length) { <p>No hay transiciones disponibles para esta alerta.</p> }
        @if (pending(); as intent) { <section class="notification-confirmation" aria-labelledby="notification-confirmation-title"><h3 id="notification-confirmation-title">Confirmar cambio</h3><p>Vas a cambiar la alerta a <strong>{{intent.step.destination.label}}</strong> usando la revisión {{alert.revision.wire}}.</p><p>Motivo: {{intent.reason}}</p><div class="notification-actions"><button type="button" [disabled]="state().busy" (click)="confirm()">Confirmar cambio</button><button type="button" [disabled]="state().busy" (click)="pending.set(null)">Cancelar</button></div></section> }
      </section> }
      @else { <p>Acceso de lectura. Sólo un administrador puede cambiar el estado.</p> }
    }
    @if (state().recovery.locked) { <section aria-label="Recuperación de comando"><p role="alert">Hay un comando sin confirmar. No se puede crear otro.</p>@if (state().recovery.pending?.lifecycle; as pending) { <p>{{pending.operation.label}} · Revisión esperada {{pending.expectedRevision.wire}} · Clave <span class="notification-identifier">{{pending.commandId}}</span></p><p>Motivo original: {{pending.reason.wire}}</p>@if (pending.alertId === state().id.wire && admin()) { <button type="button" [disabled]="state().busy" (click)="recover.emit()">Recuperar comando pendiente</button> } @else { <a [routerLink]="['/user/notifications', pending.alertId]">Ir a la alerta del comando pendiente</a> } } @else { <a routerLink="/user/notifications">Recuperar preferencia en el centro</a><p>Si el registro no es válido, conservá esta sesión y solicitá asistencia.</p> }</section> }
    <p role="status">{{state().message}}</p>
    @if (state().receipt; as receipt) { <section aria-labelledby="notification-receipt-title"><h2 id="notification-receipt-title">Recibo del comando</h2><p>Resultado histórico del comando; la revisión actual se muestra arriba.</p><dl><dt>Resultado</dt><dd>{{receipt.outcome.label}}</dd><dt>Acción</dt><dd>{{receipt.operation.label}}</dd><dt>Usuario</dt><dd class="notification-identifier">{{receipt.actorId.wire}}</dd><dt>Fecha</dt><dd>{{receipt.occurredAt | date:'medium'}}</dd><dt>Motivo</dt><dd>{{receipt.reason}}</dd><dt>Revisión del recibo</dt><dd>{{receipt.currentRevision.wire}}</dd><dt>Clave del comando</dt><dd class="notification-identifier">{{receipt.commandId}}</dd></dl></section> }
  </section>`,
})
export class NotificationDetailViewComponent {
  readonly state = input.required<ReturnType<NotificationDetailStore['vm']>>(); readonly admin = input.required<boolean>(); readonly backQuery = input<Record<string, string>>({});
  readonly reload = output<void>(); readonly recover = output<void>(); readonly transition = output<NotificationTransitionIntent>();
  readonly reason = signal(''); readonly pending = signal<NotificationTransitionIntent | null>(null); readonly states = NotificationLoadState;
  private readonly formIdentity = computed(() => `${this.state().id.wire}:${this.state().alert?.id.wire ?? ''}:${this.state().alert?.revision.wire ?? ''}:${this.admin()}`);
  constructor() { effect(() => { this.formIdentity(); this.reason.set(''); this.pending.set(null); }); }
  review(step: NotificationStep): void { const alert = this.state().alert; if (alert) this.pending.set({ alertId: alert.id, expectedRevision: alert.revision, step, reason: this.reason() }); }
  confirm(): void { const intent = this.pending(); if (!intent) return; this.pending.set(null); this.transition.emit(intent); }
}
