import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CalendarAudience, CalendarEvent, CalendarLifecycle, CalendarLoadState, CalendarViewMode } from '../../domain/commercial-calendar/calendar';
import { CalendarCenterState } from './calendar-center.store';
@Component({ selector: 'sc-calendar-center-view', imports: [FormsModule, RouterLink], styleUrl: './calendar.css', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<main class="calendar-shell"><header><div><p class="eyebrow">Coordinación comercial</p><h1 id="calendar-title">Calendario comercial</h1><p>Agenda interna. No modifica precios, stock ni promociones.</p></div>@if (admin()) { <a class="button primary" routerLink="/user/commercial-calendar/new" [queryParams]="state().url.toWire()">Crear evento</a> }</header>
  <form class="filters" (ngSubmit)="filters.emit(values())">
    <label>Vista<select name="view" [ngModel]="value('view')" (ngModelChange)="edit('view', $event)">@for (mode of modes; track mode.wire) { <option [value]="mode.wire">{{mode.label}}</option> }</select></label>
    <label>Mes<input name="month" type="month" [ngModel]="value('month')" (ngModelChange)="edit('month', $event)" required></label>
    <label>Zona IANA<input name="zone" [ngModel]="value('zone')" (ngModelChange)="edit('zone', $event)" required aria-describedby="zone-help"></label>
    <label>Estado<select name="lifecycle" [ngModel]="value('lifecycle')" (ngModelChange)="edit('lifecycle', $event)"><option value="">Todos</option>@for (status of lifecycles; track status.wire) { <option [value]="status.wire">{{status.label}}</option> }</select></label>
    <label>Audiencia<select name="audience" [ngModel]="value('audience')" (ngModelChange)="edit('audience', $event)"><option value="">Todas</option><option [value]="audience.wire">{{audience.label}}</option></select></label>
    <label>Por página<select name="size" [ngModel]="value('size')" (ngModelChange)="edit('size', $event)"><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label><button type="submit">Aplicar filtros</button>
  </form><p id="zone-help">Zona de visualización aplicada: <strong>{{state().url.zone}}</strong>. Los límites del mes se resuelven en esta zona.</p>
  @if (dirty()) { <p role="status">Filtros modificados sin aplicar. Se conservan los resultados de la consulta aplicada.</p> }
  <div class="status" role="status" aria-live="polite">{{state().status.label}}</div>
  <button type="button" (click)="reload.emit()" [disabled]="loading()">Actualizar</button>
  @if (state().page; as result) { <p>{{result.total}} resultados en total · Página {{result.page + 1}} · {{result.items.length}} eventos cargados.</p><p class="notice">Esta vista muestra una sola página. Un día sin eventos cargados no implica que esté vacío. Consultá las otras páginas.</p>
    @if (state().url.view === monthMode) { <div class="month-grid" aria-label="Días del mes con eventos de esta página">@for (day of days(); track day.date) { <section class="day"><h2>{{day.label}}</h2>@for (event of day.events; track event.id) { <a [id]="'event-' + event.id + '-' + day.date" [attr.data-calendar-event]="event.id" [routerLink]="['/user/commercial-calendar',event.id]" [queryParams]="state().url.toWire()">{{event.definition.title}}<span>{{event.lifecycle.label}}</span></a> }@if (!day.events.length) { <p>Sin eventos en esta página</p> }</section> }</div> }
    @else { <ul class="event-list">@for (event of result.items; track event.id) { <li><a [id]="'event-' + event.id" [attr.data-calendar-event]="event.id" [routerLink]="['/user/commercial-calendar',event.id]" [queryParams]="state().url.toWire()">{{event.definition.title}}</a><span class="badge">{{event.lifecycle.label}}</span><p>{{event.definition.start.localDateTime}} · {{event.definition.start.timeZone}} {{event.definition.start.offset}}</p><p>{{event.definition.audience.label}}</p></li> }</ul> }
  }
  <nav class="pagination" aria-label="Páginas del calendario"><button type="button" (click)="page.emit(-1)" [disabled]="loading() || !state().page || state().url.query.page === 0">Anterior</button><button type="button" (click)="page.emit(1)" [disabled]="loading() || !state().page?.hasMore">Siguiente</button></nav>
  </main>` })
export class CalendarCenterViewComponent {
  readonly state = input.required<CalendarCenterState>(); readonly admin = input(false);
  readonly filters = output<Record<string, string>>(); readonly page = output<number>(); readonly reload = output<void>();
  readonly modes = [CalendarViewMode.Month, CalendarViewMode.List]; readonly monthMode = CalendarViewMode.Month;
  readonly lifecycles = [CalendarLifecycle.Draft, CalendarLifecycle.Scheduled, CalendarLifecycle.Active, CalendarLifecycle.Paused, CalendarLifecycle.Completed, CalendarLifecycle.Cancelled]; readonly audience = CalendarAudience.InternalAll;
  readonly edited = signal<{base: string; values: Record<string, string>} | null>(null);
  readonly dirty = computed(() => this.edited()?.base === JSON.stringify(this.state().url.toWire()) && JSON.stringify(this.values()) !== JSON.stringify(this.state().url.toWire()));
  readonly loading = computed(() => [CalendarLoadState.Loading, CalendarLoadState.Refreshing].includes(this.state().status));
  values(): Record<string, string> { return this.edited()?.base === JSON.stringify(this.state().url.toWire()) ? this.edited()!.values : this.state().url.toWire(); }
  value(key: string): string { return this.values()[key] ?? ''; }
  edit(key: string, value: string): void { this.edited.set({ base: JSON.stringify(this.state().url.toWire()), values: { ...this.values(), [key]: value } }); }
  readonly days = computed(() => {
    const state = this.state(); if (!state.url.valid) return [];
    const [year, month] = state.url.month.split('-').map(Number), count = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: state.url.zone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const date = (instant: string): string => { const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type,part.value])); return `${parts['year']}-${parts['month']}-${parts['day']}`; };
    return Array.from({length:count}, (_, index) => { const key = `${state.url.month}-${String(index + 1).padStart(2,'0')}`; return { date:key, label:String(index + 1), events:(state.page?.items ?? []).filter((event: CalendarEvent) => date(event.definition.start.instant) <= key && date(new Date(Date.parse(event.definition.end.instant)-1).toISOString()) >= key) }; });
  });
}
