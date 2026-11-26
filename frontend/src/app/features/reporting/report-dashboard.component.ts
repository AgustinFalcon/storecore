import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UserSession } from '../../core/auth/user-session';
import { ReportAvailability, ReportExportFailure, ReportExportFailureKind, ReportExportState, ReportPaymentDisposition } from '../../domain/reporting/report';
import { ReportDashboardStore } from './report-dashboard.store';
import { ReportDownloadEffect } from './report-download.effect';

@Component({
  selector: 'sc-report-dashboard',
  imports: [AsyncPipe, FormsModule],
  providers: [ReportDashboardStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="report-dashboard" aria-labelledby="report-title">
      <header class="hero">
        <div>
          <p class="eyebrow">Centro de inteligencia comercial</p>
          <h1 id="report-title">Reportes comerciales</h1>
          <p>Una lectura confiable de ventas, pagos, productos e inventario. Lo que todavía no tiene evidencia aparece como no disponible, nunca como cero.</p>
        </div>
        <span class="hero-badge" aria-label="Fuente de datos">StoreCore · datos autoritativos</span>
      </header>

      <form class="period-form" (ngSubmit)="apply()" aria-label="Período del reporte">
        <label><span>Desde</span><input type="date" name="fromDate" [ngModel]="store.snapshot.draftFromDate" (ngModelChange)="store.setDraftFromDate($event)" required></label>
        <label><span>Hasta (sin incluir)</span><input type="date" name="toDateExclusive" [ngModel]="store.snapshot.draftToDateExclusive" (ngModelChange)="store.setDraftToDateExclusive($event)" required></label>
        <div class="form-actions">
          <button class="primary" type="submit">Aplicar período</button>
          <button type="button" (click)="store.refresh()" [disabled]="!store.snapshot.applied">Actualizar</button>
          <button type="button" (click)="download()" [disabled]="!store.snapshot.report || exportState() === downloading">Exportar CSV</button>
        </div>
      </form>
      <p class="report-status export-status" role="status" aria-live="polite">{{exportState().label}}</p>

      @if (store.vm$ | async; as state) {
        <p class="report-status" role="status" aria-live="polite">{{state.loadState.label}}</p>
        @if (state.message) { <p class="notice" role="alert">{{state.message}}</p> }
        @if (state.report; as report) {
          <div class="period-summary">
            <span>Período analizado</span>
            <strong>{{report.period.fromDate}} — {{report.period.toDateExclusive}}</strong>
            <small>{{report.period.timezone}} · generado {{report.period.generatedAt}}</small>
          </div>

          <section aria-labelledby="summary-title">
            <div class="section-heading"><div><p class="eyebrow">Pulso del negocio</p><h2 id="summary-title">Resumen ejecutivo</h2></div></div>
            <div class="metric-grid">
            <article class="metric-card">
              <span class="metric-kicker">Demanda</span><h3>Pedidos creados</h3>
              @if (report.metrics.createdOrders.availability === available) {
                <strong>{{report.metrics.createdOrders.value?.count}}</strong><span>ARS {{report.metrics.createdOrders.value?.nominalTotal}}</span><small>{{report.metrics.createdOrders.evidence?.source?.label}} · {{report.metrics.createdOrders.evidence?.timeBasis?.label}}</small>
              } @else { <span class="availability">{{report.metrics.createdOrders.availability.label}}</span> }
            </article>
            <article class="metric-card">
              <span class="metric-kicker">Cobros</span><h3>Acreditaciones aplicadas</h3>
              @if (report.metrics.appliedAccreditations.availability === available) {
                <strong>{{report.metrics.appliedAccreditations.value?.count}}</strong><span>ARS {{report.metrics.appliedAccreditations.value?.confirmedGross}}</span><small>{{report.metrics.appliedAccreditations.evidence?.source?.label}} · {{report.metrics.appliedAccreditations.evidence?.timeBasis?.label}}</small>
              } @else { <span class="availability">{{report.metrics.appliedAccreditations.availability.label}}</span> }
            </article>
            <article class="metric-card">
              <span class="metric-kicker">Rentabilidad</span><h3>Ingresos netos</h3>
              @if (report.metrics.netRevenue.availability === available) { <strong>ARS {{report.metrics.netRevenue.value}}</strong> }
              @else { <span class="availability">{{report.metrics.netRevenue.availability.label}}</span> }
            </article>
            <article class="metric-card">
              <span class="metric-kicker">Fiscal</span><h3>Total fiscal</h3>
              @if (report.metrics.fiscalTotal.availability === available) { <strong>ARS {{report.metrics.fiscalTotal.value}}</strong> }
              @else { <span class="availability">{{report.metrics.fiscalTotal.availability.label}}</span> }
            </article>
            </div>
          </section>

          <div class="two-column">
            <section class="panel" aria-labelledby="products-title">
              <div class="section-heading"><div><p class="eyebrow">Catálogo</p><h2 id="products-title">Productos que mueven el negocio</h2></div></div>
              <h3>Productos por unidades acreditadas</h3>
              <p class="definition">Unidades acreditadas brutas; no descuenta devoluciones.</p>
              @if (report.metrics.bestSellers.availability === available) {
                <ol class="rank-list">
                  @for (item of report.metrics.bestSellers.value?.items ?? []; track item.variantId) {
                    <li><span><strong>{{item.name}}</strong><small>{{item.sku}}</small></span><b>{{item.grossUnits}} u.</b></li>
                  } @empty { <li class="empty">Sin unidades acreditadas en el período.</li> }
                </ol>
                <p class="list-meta">{{report.metrics.bestSellers.value?.total}} resultados @if (report.metrics.bestSellers.value?.truncated) { · mostrando los principales }</p>
              } @else { <p class="availability">{{report.metrics.bestSellers.availability.label}}</p> }
              <h3>Stock bajo actual</h3>
              <p class="definition">Observación actual al momento de generación; no es un saldo histórico del período.</p>
              @if (report.metrics.lowStock.availability === available) {
                <ul class="stock-list">
                  @for (item of report.metrics.lowStock.value?.items ?? []; track item.variantId) {
                    <li><span><strong>{{item.productName}}</strong><small>{{item.sku}} · {{item.variantLabel}}</small></span><b>{{item.availableQuantity}} / {{item.safetyStock}}</b></li>
                  } @empty { <li class="empty">No hay productos bajo el stock de seguridad.</li> }
                </ul>
                <p class="list-meta">Mostrando {{report.metrics.lowStock.value?.items?.length ?? 0}} de {{report.metrics.lowStock.value?.total}} @if (report.metrics.lowStock.value?.truncated) { · listado recortado }</p>
              } @else { <p class="availability">{{report.metrics.lowStock.availability.label}}</p> }
            </section>

            <section class="panel" aria-labelledby="operation-title">
              <div class="section-heading"><div><p class="eyebrow">Operación</p><h2 id="operation-title">Pagos, inventario y devoluciones</h2></div></div>
              <h3>Estado de pagos</h3>
              @if (report.metrics.paymentDisposition.availability === available) {
                <div class="status-grid">
                  @for (entry of paymentEntries(report.metrics.paymentDisposition.value?.counts); track entry.label) {
                    <span><small>{{entry.label}}</small><strong>{{entry.value}}</strong></span>
                  } @empty { <p class="empty">Sin pagos clasificados.</p> }
                </div>
              } @else { <p class="availability">{{report.metrics.paymentDisposition.availability.label}}</p> }
              <h3>Movimientos de inventario</h3>
              @if (report.metrics.inventoryMovements.availability === available) {
                <ul class="movement-list">
                  @for (item of report.metrics.inventoryMovements.value?.groups ?? []; track item.eventType.wire + item.channel.wire) {
                    <li><span>{{item.eventType.label}} · {{item.channel.label}}</span><b>{{item.quantityDeltaSum}} u. ({{item.count}})</b></li>
                  } @empty { <li class="empty">Sin movimientos en el período.</li> }
                </ul>
              } @else { <p class="availability">{{report.metrics.inventoryMovements.availability.label}}</p> }
              <div class="mini-grid">
                <article><h3>Devoluciones recibidas</h3>@if (report.metrics.returnReceipts.availability === available) {<strong>{{report.metrics.returnReceipts.value?.returnCount}}</strong><span>{{report.metrics.returnReceipts.value?.returnedUnits}} unidades</span>} @else {<span class="availability">{{report.metrics.returnReceipts.availability.label}}</span>}</article>
                <article><h3>Disposición confirmada</h3>@if (report.metrics.confirmedReturnDisposition.availability === available) {<strong>{{report.metrics.confirmedReturnDisposition.value?.confirmedReturnCount}}</strong><span>{{report.metrics.confirmedReturnDisposition.value?.restockUnits}} repuestas · {{report.metrics.confirmedReturnDisposition.value?.damagedUnits}} dañadas · {{report.metrics.confirmedReturnDisposition.value?.rejectedUnits}} rechazadas</span>} @else {<span class="availability">{{report.metrics.confirmedReturnDisposition.availability.label}}</span>}</article>
              </div>
            </section>
          </div>

          <section class="channel-panel" aria-labelledby="channel-title">
            <div class="section-heading"><div><p class="eyebrow">Estado del canal</p><h2 id="channel-title">BlackStore</h2></div>
              @if (report.metrics.blackStoreModuleState.availability === available) { <span class="availability">{{report.metrics.blackStoreModuleState.value?.label}}</span> }
              @else { <span class="availability">{{report.metrics.blackStoreModuleState.availability.label}}</span> }
            </div>
            <div class="channel-grid">
              <article><h3>Registro</h3>@if (report.metrics.blackStoreRegistration.availability === available) {<strong>{{report.metrics.blackStoreRegistration.value?.state.label}}</strong><span>{{report.metrics.blackStoreRegistration.value?.revokedHistoryCount}} historiales revocados</span>} @else {<span>{{report.metrics.blackStoreRegistration.availability.label}}</span>}</article>
              <article><h3>Inventario actual</h3>@if (report.metrics.blackStoreCurrentStock.availability === available) {<strong>{{report.metrics.blackStoreCurrentStock.value?.sellableUnits}} u.</strong><span>{{report.metrics.blackStoreCurrentStock.value?.total}} variantes</span>} @else {<span>{{report.metrics.blackStoreCurrentStock.availability.label}}</span>}</article>
              <article><h3>Ventas BlackStore</h3><strong>{{report.metrics.blackStoreSales.availability.label}}</strong></article>
              <article><h3>Sincronización</h3><strong>{{report.metrics.blackStoreSynchronization.availability.label}}</strong></article>
              <article><h3>Frescura remota</h3>@if (report.metrics.blackStoreRemoteFreshness.availability === available) {<strong>{{report.metrics.blackStoreRemoteFreshness.value}}</strong>} @else {<strong>{{report.metrics.blackStoreRemoteFreshness.availability.label}}</strong><span>{{report.metrics.blackStoreRemoteFreshness.reason?.label}}</span>}</article>
            </div>
          </section>
          <p class="evidence-note">Cada indicador conserva su fuente y período. Una métrica no disponible no se reemplaza por cero. La operación actual; no conserva este período.</p>
        }
      }
    </section>
  `,
  styles: [`
    :host { display:block; }
    .report-dashboard { display:grid; gap:1.25rem; color:#14213d; }
    .hero { display:flex; justify-content:space-between; gap:2rem; align-items:flex-start; padding:clamp(1.4rem,3vw,2.25rem); border-radius:1.5rem; color:#fff; background:linear-gradient(135deg,#111b35 0%,#193e69 64%,#087e8b 100%); box-shadow:0 18px 45px #172b4d24; }
    .hero h1 { margin:.15rem 0 .6rem; font-size:clamp(2rem,4vw,3rem); letter-spacing:-.04em; }
    .hero p:not(.eyebrow) { max-width:48rem; margin:0; color:#e9f3ff; line-height:1.65; }
    .hero-badge { flex:none; padding:.55rem .8rem; border:1px solid #ffffff55; border-radius:999px; background:#ffffff19; font-size:.8rem; font-weight:750; }
    .eyebrow { margin:0; color:#056c77; font-size:.72rem; font-weight:850; letter-spacing:.12em; text-transform:uppercase; }
    .hero .eyebrow { color:#8de5dc; }
    .period-form { display:grid; grid-template-columns:minmax(10rem,1fr) minmax(10rem,1fr) auto; gap:1rem; align-items:end; padding:1.1rem; border:1px solid #dbe4ef; border-radius:1.1rem; background:#fff; box-shadow:0 8px 24px #14213d0c; }
    label { display:grid; gap:.4rem; font-size:.8rem; font-weight:750; color:#40526b; }
    input { min-height:2.75rem; padding:0 .8rem; border:1px solid #bdcad9; border-radius:.7rem; background:#fbfdff; color:#14213d; font:inherit; }
    input:focus-visible, button:focus-visible { outline:3px solid #29b6c744; outline-offset:2px; }
    .form-actions { display:flex; flex-wrap:wrap; gap:.55rem; }
    button { min-height:2.75rem; padding:.65rem .9rem; border:1px solid #b8c6d8; border-radius:.7rem; background:#fff; color:#193e69; font-weight:800; cursor:pointer; }
    button.primary { border-color:#087e8b; color:#fff; background:#087e8b; }
    button:disabled { opacity:.48; cursor:not-allowed; }
    .report-status { margin:0; color:#52657e; font-size:.86rem; }
    .export-status { justify-self:end; margin-top:-.9rem; }
    .notice { padding:.9rem 1rem; border-left:4px solid #c66b10; border-radius:.6rem; background:#fff4e7; }
    .period-summary { display:flex; flex-wrap:wrap; gap:.4rem 1rem; align-items:baseline; padding:.85rem 1rem; border-radius:.8rem; background:#edf7f7; color:#23465a; }
    .period-summary > span { font-size:.78rem; font-weight:800; text-transform:uppercase; letter-spacing:.06em; }
    .period-summary small { margin-left:auto; color:#536b7a; }
    section[aria-labelledby] { display:grid; gap:.85rem; }
    .section-heading { display:flex; justify-content:space-between; gap:1rem; align-items:end; }
    .section-heading h2 { margin:.18rem 0 0; font-size:1.3rem; letter-spacing:-.02em; }
    .metric-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:.85rem; }
    .metric-card, .panel, .channel-panel { border:1px solid #dce5ef; border-radius:1rem; background:#fff; box-shadow:0 8px 24px #14213d0b; }
    .metric-card { display:grid; align-content:start; gap:.35rem; min-height:9rem; padding:1rem; border-top:4px solid #0e8490; }
    .metric-card h3, .panel h3, .channel-grid h3 { margin:0; color:#41536c; font-size:.88rem; }
    .metric-card strong { font-size:1.8rem; letter-spacing:-.04em; }
    .metric-card span { color:#62738a; }
    .metric-kicker { font-size:.68rem; font-weight:850; letter-spacing:.09em; text-transform:uppercase; }
    .availability { display:inline-flex; width:max-content; padding:.28rem .55rem; border-radius:999px; background:#eef2f7; color:#4d5f77; font-size:.78rem; font-weight:750; }
    .two-column { display:grid; grid-template-columns:1fr 1fr; gap:1rem; align-items:start; }
    .panel, .channel-panel { padding:1.1rem; }
    .panel { gap:1rem; }
    .rank-list, .stock-list, .movement-list { display:grid; gap:.15rem; margin:0; padding:0; list-style:none; }
    .rank-list { counter-reset:rank; }
    .rank-list li { counter-increment:rank; }
    .rank-list li:not(.empty)::before { content:counter(rank); display:grid; place-items:center; width:1.7rem; height:1.7rem; border-radius:50%; color:#087e8b; background:#e4f5f4; font-weight:850; }
    .rank-list li, .stock-list li, .movement-list li { display:flex; gap:.7rem; justify-content:space-between; align-items:center; min-height:3.2rem; padding:.55rem .15rem; border-bottom:1px solid #e8eef4; }
    .rank-list li > span, .stock-list li > span { display:grid; gap:.15rem; margin-right:auto; }
    li small { color:#596a80; }
    li b { white-space:nowrap; color:#244863; }
    .list-meta { color:#596a80; font-size:.78rem; }
    .definition { margin:-.45rem 0 0; color:#596a80; font-size:.78rem; line-height:1.45; }
    .status-grid, .mini-grid, .channel-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.65rem; }
    .status-grid > span, .mini-grid article, .channel-grid article { display:grid; gap:.3rem; padding:.75rem; border-radius:.75rem; background:#f6f9fc; }
    .status-grid small, .channel-grid span, .mini-grid span { color:#4f6178; }
    .status-grid strong { font-size:1.25rem; }
    .channel-grid { grid-template-columns:repeat(4,minmax(0,1fr)); }
    .channel-grid strong { font-size:1.05rem; }
    .metric-card .availability, .mini-grid .availability { color:#4d5f77; }
    .empty { color:#596a80; font-style:italic; }
    .evidence-note { margin:0; padding:1rem; border-radius:.8rem; background:#f4f6f9; color:#53657c; font-size:.82rem; line-height:1.55; }
    @media (max-width:960px) { .metric-grid,.channel-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .two-column { grid-template-columns:1fr; } .period-form { grid-template-columns:1fr 1fr; } .form-actions { grid-column:1/-1; } }
    @media (max-width:600px) { .hero { display:grid; } .hero-badge { justify-self:start; } .period-form,.metric-grid,.channel-grid,.mini-grid { grid-template-columns:1fr; } .period-form { align-items:stretch; } .form-actions { display:grid; } .period-summary { display:grid; } .period-summary small { margin-left:0; } .export-status { justify-self:start; } }
  `],
})
export class ReportDashboardComponent {
  readonly store = inject(ReportDashboardStore);
  readonly available = ReportAvailability.Available;
  readonly exportState = signal(ReportExportState.Idle);
  readonly downloading = ReportExportState.Downloading;
  private readonly router = inject(Router);
  private readonly downloadEffect = inject(ReportDownloadEffect);
  private readonly destroyRef = inject(DestroyRef);
  private readonly routeParams = signal<ParamMap | null>(null);
  private exportGeneration = 0;

  constructor() {
    const route = inject(ActivatedRoute);
    const session = inject(UserSession);
    effect(() => {
      session.authenticationEpoch(); session.authenticated(); session.principal();
      const params = this.routeParams();
      ++this.exportGeneration;
      this.store.setActor();
      this.exportState.set(ReportExportState.Idle);
      if (params !== null) this.store.bindUrl(params);
    });
    route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => this.routeParams.set(params));
  }

  apply(): void {
    const boundary = this.store.draftBoundary();
    if (!boundary) return;
    void this.router.navigate([], { queryParams: { fromDate: boundary.query.fromDate, toDateExclusive: boundary.query.toDateExclusive } });
  }

  paymentEntries(counts: ReadonlyMap<ReportPaymentDisposition, string> | undefined): readonly { readonly label: string; readonly value: string }[] {
    return counts ? [...counts].map(([status, value]) => Object.freeze({ label: status.label, value })) : [];
  }

  download(): void {
    if (this.exportState() === ReportExportState.Downloading) return;
    const request = this.store.exportFile();
    if (request === null) { this.exportState.set(ReportExportState.Failed); return; }
    const generation = ++this.exportGeneration;
    this.exportState.set(ReportExportState.Downloading);
    let saved = false;
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: file => {
        if (generation !== this.exportGeneration) return;
        try { this.downloadEffect.save(file); saved = true; this.exportState.set(ReportExportState.Completed); }
        catch { this.exportState.set(ReportExportState.Failed); }
      },
      error: error => { if (generation === this.exportGeneration) this.exportState.set(this.exportFailure(error)); },
      complete: () => { if (generation === this.exportGeneration && !saved) this.exportState.set(ReportExportState.Failed); },
    });
  }

  private exportFailure(error: unknown): ReportExportState {
    if (!(error instanceof ReportExportFailure)) return ReportExportState.Failed;
    if (error.kind === ReportExportFailureKind.StalePeriod) return ReportExportState.Stale;
    if (error.kind === ReportExportFailureKind.TooLarge) return ReportExportState.TooLarge;
    if (error.kind === ReportExportFailureKind.Denied) return ReportExportState.Denied;
    if (error.kind === ReportExportFailureKind.Unavailable) return ReportExportState.Unavailable;
    return ReportExportState.Failed;
  }
}
