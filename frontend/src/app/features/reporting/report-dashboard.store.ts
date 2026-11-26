import { HttpErrorResponse } from '@angular/common/http';
import { Inject, Injectable, OnDestroy } from '@angular/core';
import { ParamMap } from '@angular/router';
import { ComponentStore } from '@ngrx/component-store';
import { Subscription } from 'rxjs';
import { UserSession } from '../../core/auth/user-session';
import { CHANNEL_REPORT_REPOSITORY } from '../../core/tokens/reporting.tokens';
import { ChannelReport, ChannelReportRepository, ReportLoadState, ReportPeriodQuery } from '../../domain/reporting/report';
import { ReportQueryBoundary } from '../../domain/reporting/report-query';
import { ReportQueryAdapter } from '../../data/reporting/report-query.adapter';

export interface ReportDashboardState {
  readonly loadState: ReportLoadState;
  readonly draftFromDate: string;
  readonly draftToDateExclusive: string;
  readonly applied: ReportPeriodQuery | null;
  readonly report: ChannelReport | null;
  readonly message: string;
}

const INITIAL: ReportDashboardState = {
  loadState: ReportLoadState.Unselected,
  draftFromDate: '',
  draftToDateExclusive: '',
  applied: null,
  report: null,
  message: '',
};

@Injectable()
export class ReportDashboardStore extends ComponentStore<ReportDashboardState> implements OnDestroy {
  readonly vm$ = this.select(state => state);
  private identity: string | null = null;
  private sequence = 0;
  private active: Subscription | null = null;

  constructor(
    @Inject(CHANNEL_REPORT_REPOSITORY) private readonly repository: ChannelReportRepository,
    private readonly session: UserSession,
  ) { super(INITIAL); }

  get snapshot(): ReportDashboardState { return this.get(state => state); }

  setActor(): void {
    const next = this.actorIdentity();
    if (next === this.identity) return;
    this.identity = next;
    this.cancel();
    this.setState(next === null ? { ...INITIAL, loadState: ReportLoadState.Denied, message: 'La sesión de operaciones no está disponible.' } : INITIAL);
  }

  bindUrl(params: ParamMap): void {
    if (params.keys.length === 0) {
      this.cancel();
      this.patchState({ loadState: ReportLoadState.Unselected, applied: null, report: null, message: '' });
      return;
    }
    const boundary = ReportQueryAdapter.fromUrl(params);
    if (boundary === null) {
      this.cancel();
      this.patchState({ loadState: ReportLoadState.Invalid, applied: null, report: null, message: 'La URL del reporte no define un período válido.' });
      return;
    }
    this.patchState({ draftFromDate: boundary.query.fromDate, draftToDateExclusive: boundary.query.toDateExclusive });
    this.read(boundary);
  }

  setDraftFromDate(value: string): void { this.patchState({ draftFromDate: value }); }
  setDraftToDateExclusive(value: string): void { this.patchState({ draftToDateExclusive: value }); }
  draftBoundary(): ReportQueryBoundary | null { return ReportQueryBoundary.create(this.snapshot.draftFromDate, this.snapshot.draftToDateExclusive); }

  refresh(): void {
    const applied = this.snapshot.applied;
    if (applied === null) return;
    const boundary = ReportQueryBoundary.create(applied.fromDate, applied.toDateExclusive);
    if (boundary !== null) this.read(boundary);
  }

  override ngOnDestroy(): void { this.cancel(); super.ngOnDestroy(); }

  private read(boundary: ReportQueryBoundary): void {
    const identity = this.actorIdentity();
    if (identity === null || identity !== this.identity) {
      this.setActor();
      return;
    }
    const previous = this.snapshot;
    const samePeriod = previous.applied?.fromDate === boundary.query.fromDate && previous.applied?.toDateExclusive === boundary.query.toDateExclusive;
    const retained = samePeriod ? previous.report : null;
    const sequence = ++this.sequence;
    this.active?.unsubscribe();
    this.patchState({
      applied: boundary.query,
      report: retained,
      loadState: retained ? ReportLoadState.Refreshing : ReportLoadState.Loading,
      message: '',
    });
    this.active = this.repository.read(boundary.query).subscribe({
      next: report => {
        if (!this.current(identity, sequence)) return;
        this.patchState({ report, loadState: ReportLoadState.Ready, message: '' });
      },
      error: (error: unknown) => {
        if (!this.current(identity, sequence)) return;
        const denied = error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403);
        const invalid = error instanceof HttpErrorResponse && error.status === 400;
        const unavailable = error instanceof HttpErrorResponse && (error.status === 0 || error.status === 502 || error.status === 503);
        const stale = retained !== null && !denied && !invalid;
        this.patchState({
          report: stale ? retained : null,
          loadState: stale ? ReportLoadState.Stale : denied ? ReportLoadState.Denied : invalid ? ReportLoadState.Invalid : unavailable ? ReportLoadState.Unavailable : ReportLoadState.Corrupt,
          message: stale ? 'No pudimos actualizar. Se conserva la última lectura identificada como desactualizada.'
            : denied ? 'La sesión ya no tiene permiso para ver reportes.'
              : invalid ? 'El período solicitado no es válido.'
                : unavailable ? 'El reporte no está disponible en este momento.' : 'La respuesta del reporte no supera la validación del contrato.',
        });
      },
    });
  }

  private current(identity: string, sequence: number): boolean {
    return sequence === this.sequence && identity === this.identity && identity === this.actorIdentity();
  }
  private actorIdentity(): string | null {
    const principal = this.session.principal();
    return this.session.authenticated() && principal
      ? `${this.session.authenticationEpoch()}:${principal.id}:${principal.roles.map(role => role.wire).sort().join(',')}` : null;
  }
  private cancel(): void { ++this.sequence; this.active?.unsubscribe(); this.active = null; }
}
