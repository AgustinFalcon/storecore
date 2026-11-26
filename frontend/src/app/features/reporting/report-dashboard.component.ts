import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ReportAvailability } from '../../domain/reporting/report';
import { ReportDashboardStore } from './report-dashboard.store';

@Component({
  selector: 'sc-report-dashboard',
  imports: [AsyncPipe, FormsModule],
  providers: [ReportDashboardStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="report-dashboard" aria-labelledby="report-title">
      <header>
        <p class="eyebrow">Operación y rendimiento</p>
        <h1 id="report-title">Reportes comerciales</h1>
        <p>Lecturas autoritativas de StoreCore. Las fuentes no modeladas se muestran explícitamente.</p>
      </header>

      <form class="period-form" (ngSubmit)="apply()" aria-label="Período del reporte">
        <label>Desde <input type="date" name="fromDate" [ngModel]="store.snapshot.draftFromDate" (ngModelChange)="store.setDraftFromDate($event)" required></label>
        <label>Hasta <input type="date" name="toDateExclusive" [ngModel]="store.snapshot.draftToDateExclusive" (ngModelChange)="store.setDraftToDateExclusive($event)" required></label>
        <button type="submit">Aplicar período</button>
        <button type="button" (click)="store.refresh()" [disabled]="!store.snapshot.applied">Actualizar</button>
      </form>

      @if (store.vm$ | async; as state) {
        <p class="report-status" role="status" aria-live="polite">{{state.loadState.label}}</p>
        @if (state.message) { <p class="notice" role="alert">{{state.message}}</p> }
        @if (state.report; as report) {
          <p class="period-summary">{{report.period.fromDate}} — {{report.period.toDateExclusive}} · {{report.period.timezone}}</p>
          <section class="metric-grid" aria-label="Indicadores del período">
            <article class="metric-card">
              <h2>Pedidos creados</h2>
              @if (report.metrics.createdOrders.availability === available) {
                <strong>{{report.metrics.createdOrders.value?.count}}</strong>
                <span>ARS {{report.metrics.createdOrders.value?.nominalTotal}}</span>
              } @else { <span>{{report.metrics.createdOrders.availability.label}}</span> }
            </article>
            <article class="metric-card">
              <h2>Ventas BlackStore</h2>
              <span>{{report.metrics.blackStoreSales.availability.label}}</span>
            </article>
            <article class="metric-card">
              <h2>Ingresos netos</h2>
              <span>{{report.metrics.netRevenue.availability.label}}</span>
            </article>
            <article class="metric-card">
              <h2>Inventario actual</h2>
              <span>{{report.metrics.blackStoreCurrentStock.availability.label}}</span>
            </article>
          </section>
          <p class="evidence-note">Cada indicador conserva su fuente y período. Una métrica no disponible no se reemplaza por cero. La operación actual; no conserva este período.</p>
        }
      }
    </main>
  `,
})
export class ReportDashboardComponent {
  readonly store = inject(ReportDashboardStore);
  readonly available = ReportAvailability.Available;
  private readonly router = inject(Router);

  constructor() {
    const route = inject(ActivatedRoute);
    this.store.setActor();
    route.queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(params => this.store.bindUrl(params));
  }

  apply(): void {
    const boundary = this.store.draftBoundary();
    if (!boundary) return;
    void this.router.navigate([], { queryParams: { fromDate: boundary.query.fromDate, toDateExclusive: boundary.query.toDateExclusive } });
  }
}
