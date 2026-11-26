import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Observable, of, Subject } from 'rxjs';
import { throwError } from 'rxjs';
import { UserSession } from '../../core/auth/user-session';
import { CHANNEL_REPORT_REPOSITORY } from '../../core/tokens/reporting.tokens';
import { ReportMapper } from '../../data/reporting/report.mapper';
import { reportEnvelopeFixture } from '../../data/reporting/report.spec-fixtures';
import { UserRole } from '../../domain/user/user-role';
import { ReportDashboardComponent } from './report-dashboard.component';
import { ReportDownloadEffect } from './report-download.effect';
import { ReportExportFailure, ReportExportFailureKind, ReportExportFile } from '../../domain/reporting/report';

describe('ReportDashboardComponent', () => {
  it('renders valid siblings, explicit unsupported facts and only generic navigation', () => {
    const queryParamMap = new BehaviorSubject(convertToParamMap({ fromDate: '2026-11-01', toDateExclusive: '2026-11-26' }));
    TestBed.configureTestingModule({
      imports: [ReportDashboardComponent],
      providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { queryParamMap } }, {
        provide: CHANNEL_REPORT_REPOSITORY, useValue: { read: () => of(ReportMapper.envelope(reportEnvelopeFixture())) },
      }],
    });
    TestBed.inject(UserSession).commit({ id: 'operator-1', roles: [UserRole.Operator] }, 'csrf');
    const fixture = TestBed.createComponent(ReportDashboardComponent); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('main')).toBeNull();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Pedidos creados'); expect(text).toContain('ARS 1234.50');
    expect(text).toContain('Ventas BlackStore'); expect(text).toContain('No modelado');
    expect(text).toContain('operación actual; no conserva este período');
    expect(text).not.toContain('Ver pedidos de este reporte');
  });
});

describe('ReportDashboard export', () => {
  it('downloads only the artifact returned for the displayed period and token', () => {
    const queryParamMap = new BehaviorSubject(convertToParamMap({ fromDate: '2026-11-01', toDateExclusive: '2026-11-26' }));
    const artifact = { filename: 'storecore-channel-report-2026-11-01-to-2026-11-26.csv', blob: new Blob(['csv']) };
    const repository = { read: () => of(ReportMapper.envelope(reportEnvelopeFixture())), export: vi.fn(() => of(artifact)) };
    const download = { save: vi.fn() };
    TestBed.configureTestingModule({
      imports: [ReportDashboardComponent],
      providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { queryParamMap } },
        { provide: CHANNEL_REPORT_REPOSITORY, useValue: repository }, { provide: ReportDownloadEffect, useValue: download }],
    });
    TestBed.inject(UserSession).commit({ id: 'operator-1', roles: [UserRole.Operator] }, 'csrf');
    const fixture = TestBed.createComponent(ReportDashboardComponent); fixture.detectChanges();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find((node: HTMLButtonElement) => node.textContent?.includes('Exportar CSV')) as HTMLButtonElement;
    button.click(); fixture.detectChanges();
    expect(repository.export).toHaveBeenCalledWith({ fromDate: '2026-11-01', toDateExclusive: '2026-11-26', periodToken: 'a'.repeat(64) });
    expect(download.save).toHaveBeenCalledExactlyOnceWith(artifact);
  });

  it('renders a closed stale-period result and converts browser download failure to a visible failure', () => {
    const queryParamMap = new BehaviorSubject(convertToParamMap({ fromDate: '2026-11-01', toDateExclusive: '2026-11-26' }));
    const exportRequest = vi.fn<() => Observable<ReportExportFile>>(() => throwError(() => new ReportExportFailure(ReportExportFailureKind.StalePeriod)));
    const repository = { read: () => of(ReportMapper.envelope(reportEnvelopeFixture())), export: exportRequest };
    const download = { save: vi.fn(() => { throw new Error('blocked'); }) };
    TestBed.configureTestingModule({ imports: [ReportDashboardComponent], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { queryParamMap } }, { provide: CHANNEL_REPORT_REPOSITORY, useValue: repository },
      { provide: ReportDownloadEffect, useValue: download }] });
    TestBed.inject(UserSession).commit({ id: 'operator-1', roles: [UserRole.Operator] }, 'csrf');
    const fixture = TestBed.createComponent(ReportDashboardComponent); fixture.detectChanges();
    fixture.componentInstance.download(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('El período cambió; actualizá el reporte');

    repository.export.mockReturnValue(of({ filename: 'storecore-channel-report-2026-11-01-to-2026-11-26.csv', blob: new Blob(['csv']) }));
    fixture.componentInstance.download(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se pudo descargar');
  });

  it('clears private report content immediately when the session epoch is revoked', () => {
    const queryParamMap = new BehaviorSubject(convertToParamMap({ fromDate: '2026-11-01', toDateExclusive: '2026-11-26' }));
    TestBed.configureTestingModule({ imports: [ReportDashboardComponent], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { queryParamMap } },
      { provide: CHANNEL_REPORT_REPOSITORY, useValue: { read: () => of(ReportMapper.envelope(reportEnvelopeFixture())), export: vi.fn() } }] });
    const session = TestBed.inject(UserSession);
    session.commit({ id: 'operator-1', roles: [UserRole.Operator] }, 'csrf');
    const fixture = TestBed.createComponent(ReportDashboardComponent); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Pedidos creados');
    session.clear(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Pedidos creados');
    expect(fixture.nativeElement.textContent).toContain('Sin autorización');
  });

  it('does not let stale export terminals replace a newer export state', () => {
    const queryParamMap = new BehaviorSubject(convertToParamMap({ fromDate: '2026-11-01', toDateExclusive: '2026-11-26' }));
    const first = new Subject<ReportExportFile>();
    const second = new Subject<ReportExportFile>();
    const repository = { read: () => of(ReportMapper.envelope(reportEnvelopeFixture())), export: vi.fn()
      .mockReturnValueOnce(first).mockReturnValueOnce(second) };
    const download = { save: vi.fn() };
    TestBed.configureTestingModule({ imports: [ReportDashboardComponent], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { queryParamMap } }, { provide: CHANNEL_REPORT_REPOSITORY, useValue: repository },
      { provide: ReportDownloadEffect, useValue: download }] });
    TestBed.inject(UserSession).commit({ id: 'operator-1', roles: [UserRole.Operator] }, 'csrf');
    const fixture = TestBed.createComponent(ReportDashboardComponent); fixture.detectChanges();
    fixture.componentInstance.download();
    queryParamMap.next(convertToParamMap({ fromDate: '2026-10-01', toDateExclusive: '2026-11-01' })); fixture.detectChanges();
    fixture.componentInstance.download(); fixture.detectChanges();
    first.error(new ReportExportFailure(ReportExportFailureKind.StalePeriod)); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Preparando descarga');
    const artifact = { filename: 'new.csv', blob: new Blob(['new']) };
    second.next(artifact); second.complete(); fixture.detectChanges();
    expect(download.save).toHaveBeenCalledExactlyOnceWith(artifact);
    expect(fixture.nativeElement.textContent).toContain('Descarga solicitada');
  });
});
