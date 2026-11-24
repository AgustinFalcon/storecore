import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { NotificationCenterStore } from './notification-center.store';
import { EmailOperation, EmailPreferenceState, NotificationCategory, NotificationLifecycle, NotificationLoadState, NotificationSeverity, NotificationSource } from '../../domain/notification/notification-types';
@Component({
  selector: 'sc-notification-center-view', imports: [FormsModule, RouterLink, DatePipe], changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './notifications.css',
  template: `
    <section class="notifications" aria-labelledby="notifications-title">
      <header><p>Operaciones</p><h1 id="notifications-title">Centro de notificaciones</h1><p>Alertas operativas del comercio. Abrir una alerta no cambia su estado.</p></header>
      <form class="notification-filters" (submit)="apply($event)">
        <label>Severidad<select name="severity" [ngModel]="draft()['severity'] || ''" (ngModelChange)="edit('severity', $event)"><option value="">Todas</option>@for (item of severities; track item.wire) { <option [value]="item.wire">{{item.label}}</option> }</select></label>
        <label>Categoría<select name="category" [ngModel]="draft()['category'] || ''" (ngModelChange)="edit('category', $event)"><option value="">Todas</option>@for (item of categories; track item.wire) { <option [value]="item.wire">{{item.label}}</option> }</select></label>
        <label>Estado<select name="lifecycle" [ngModel]="draft()['lifecycle'] || ''" (ngModelChange)="edit('lifecycle', $event)"><option value="">Todos</option>@for (item of lifecycles; track item.wire) { <option [value]="item.wire">{{item.label}}</option> }</select></label>
        <label>Origen<select name="source" [ngModel]="draft()['source'] || ''" (ngModelChange)="edit('source', $event)"><option value="">Todos</option>@for (item of sources; track item.wire) { <option [value]="item.wire">{{item.label}}</option> }</select></label>
        <label>Por página<select name="size" [ngModel]="draft()['size'] || '25'" (ngModelChange)="edit('size', $event)">@for (size of sizes; track size) { <option [value]="size">{{size}}</option> }</select></label>
        <button type="submit">Aplicar filtros</button><button type="button" (click)="reset()">Limpiar filtros</button>
      </form>
      @if (dirty()) { <p role="status">Filtros modificados sin aplicar. Los resultados corresponden a la URL actual.</p> }
      <div class="notification-status" role="status" aria-live="polite">{{state().status.label}}</div>
      @if (state().status === states.Error || state().status === states.Stale || state().status === states.Denied) { <button type="button" (click)="reload.emit()">Reintentar carga</button> }
      <div [attr.aria-busy]="state().status === states.Loading">
        @if (state().page; as result) {
          <p>{{result.total}} alertas · Página {{result.page + 1}}</p>
          <ul class="notification-list">@for (alert of result.items; track alert.id.wire) {
            <li><article><div class="notification-labels"><span>{{alert.severity.label}}</span><span>{{alert.lifecycle.label}}</span></div><h2><a [routerLink]="['/user/notifications', alert.id.wire]" [queryParams]="state().query.toWire()">{{alert.category.label}} · {{alert.source.label}}</a></h2><p>Origen: <span class="notification-identifier">{{alert.sourceId}}</span></p><p>Creada {{alert.createdAt | date:'medium'}} · Revisión {{alert.revision.wire}}</p><a [routerLink]="['/user/notifications', alert.id.wire]" [queryParams]="state().query.toWire()" [attr.aria-label]="'Ver detalle de ' + alert.sourceId">Ver detalle</a></article></li>
          }</ul>
        }
      </div>
      <nav aria-label="Paginación de notificaciones" class="notification-pagination"><button type="button" [disabled]="!state().query.valid || state().query.page === 0 || state().status === states.Loading" (click)="page.emit(-1)">Anterior</button><button type="button" [disabled]="!state().page?.hasMore || state().status === states.Loading" (click)="page.emit(1)">Siguiente</button></nav>
      <section class="notification-email" aria-labelledby="notification-email-title"><h2 id="notification-email-title">Mi preferencia de email</h2><p>Esta preferencia sólo afecta a tu usuario. No modifica las alertas del centro.</p>
        <p role="status">{{state().preferenceStatus.label}}</p>
        @if (state().preference; as view) {
          <p>{{view.readiness.label}}</p><p>Preferencia: {{view.preference.state.label}} · Revisión {{view.preference.revision.wire}}</p>
          @if (view.preference.categories.length) { <p>Categorías actuales: @for (item of view.preference.categories; track item.wire) { <span>{{item.label}} </span> }</p><p>Severidades actuales: @for (item of view.preference.severities; track item.wire) { <span>{{item.label}} </span> }</p> }
          <p>El consentimiento aplica a nuevas alertas elegibles. No se envía historial ni se reenvían episodios anteriores.</p>
          @if (!view.verified) { <p>Tu correo actual no está verificado. <a routerLink="/user/account">Ir a mi cuenta</a></p> }
          <fieldset [disabled]="state().busy || state().recovery.locked || state().preferenceStatus !== states.Ready"><legend>Consentimiento explícito para recibir futuras alertas</legend>
            <p>Elegí al menos una categoría y una severidad para activar la preferencia.</p>
            <fieldset><legend>Categorías</legend>@for (item of emailCategories; track item.wire) { <label class="notification-check"><input type="checkbox" [checked]="selectedCategories().includes(item)" (change)="toggleCategory(item)" />{{item.label}}</label> }</fieldset>
            <fieldset><legend>Severidades</legend>@for (item of emailSeverities; track item.wire) { <label class="notification-check"><input type="checkbox" [checked]="selectedSeverities().includes(item)" (change)="toggleSeverity(item)" />{{item.label}}</label> }</fieldset>
            <button type="button" [disabled]="!view.verified || !selectedCategories().length || !selectedSeverities().length || view.preference.state === unknownPreference" (click)="email.emit({operation: enable, categories: selectedCategories(), severities: selectedSeverities()})">Activar preferencia</button>
            <button type="button" [disabled]="view.preference.state === unknownPreference" (click)="email.emit({operation: disable, categories: [], severities: []})">Desactivar preferencia</button>
          </fieldset>
        }
        <button type="button" [disabled]="state().preferenceStatus === states.Loading" (click)="preferenceReload.emit()">Actualizar preferencia</button>
        @if (state().recovery.locked) { <p role="alert">Hay un comando sin confirmar. Las nuevas acciones están bloqueadas.</p>@if (state().recovery.pending?.email) { <button type="button" [disabled]="state().busy" (click)="recover.emit()">Recuperar preferencia pendiente</button> } @else { <p>Recuperá el comando en el detalle de la alerta correspondiente. Si el registro no es válido, conservá esta sesión y solicitá asistencia.</p> } }
        <p role="status">{{state().message}}</p>
      </section>
    </section>`,
})
export class NotificationCenterViewComponent {
  readonly state = input.required<ReturnType<NotificationCenterStore['vm']>>();
  readonly draft = input.required<Record<string, string>>();
  readonly filters = output<Record<string, string>>(); readonly reload = output<void>(); readonly preferenceReload = output<void>(); readonly page = output<number>(); readonly recover = output<void>();
  readonly email = output<{ operation: EmailOperation; categories: readonly NotificationCategory[]; severities: readonly NotificationSeverity[] }>();
  readonly states = NotificationLoadState; readonly severities = NotificationSeverity.all; readonly categories = NotificationCategory.all; readonly lifecycles = NotificationLifecycle.all; readonly sources = NotificationSource.all; readonly sizes = [25, 50, 100];
  readonly emailCategories = NotificationCategory.email; readonly emailSeverities = NotificationSeverity.email; readonly enable = EmailOperation.Enable; readonly disable = EmailOperation.Disable; readonly unknownPreference = EmailPreferenceState.Unknown;
  readonly edits = signal<Record<string, string>>({});
  readonly selectedCategories = signal<readonly NotificationCategory[]>([]); readonly selectedSeverities = signal<readonly NotificationSeverity[]>([]);
  readonly dirty = computed(() => Object.keys(this.edits()).some(key => this.edits()[key] !== (this.draft()[key] ?? '')));
  private preferenceRevision = '';
  constructor() {
    effect(() => { this.draft(); this.edits.set({}); });
    effect(() => {
      const preference = this.state().preference?.preference;
      const revision = preference ? `${preference.state.wire}:${preference.revision.wire}` : '';
      if (revision === this.preferenceRevision) return;
      this.preferenceRevision = revision;
      this.selectedCategories.set(preference?.categories ?? []);
      this.selectedSeverities.set(preference?.severities ?? []);
    });
  }
  edit(key: string, value: string): void { this.edits.update(old => ({ ...old, [key]: value })); }
  apply(event: Event): void { event.preventDefault(); const values = { ...this.draft(), ...this.edits() }; this.edits.set({}); this.filters.emit(Object.fromEntries(Object.entries(values).filter(([key, value]) => key !== 'page' && value !== ''))); }
  reset(): void { this.edits.set({}); this.filters.emit({}); }
  toggleCategory(item: NotificationCategory): void { this.selectedCategories.update(old => old.includes(item) ? old.filter(x => x !== item) : [...old, item]); }
  toggleSeverity(item: NotificationSeverity): void { this.selectedSeverities.update(old => old.includes(item) ? old.filter(x => x !== item) : [...old, item]); }
}
