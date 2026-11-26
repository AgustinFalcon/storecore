import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { convertToParamMap } from '@angular/router';
import { Subject } from 'rxjs';
import { UserSession } from '../../core/auth/user-session';
import { CHANNEL_REPORT_REPOSITORY } from '../../core/tokens/reporting.tokens';
import { ChannelReport, ReportLoadState } from '../../domain/reporting/report';
import { UserRole } from '../../domain/user/user-role';
import { ReportMapper } from '../../data/reporting/report.mapper';
import { reportEnvelopeFixture } from '../../data/reporting/report.spec-fixtures';
import { ReportDashboardStore } from './report-dashboard.store';

describe('ReportDashboardStore', () => {
  let session: UserSession;
  let repository: { read: ReturnType<typeof vi.fn> };
  let store: ReportDashboardStore;

  beforeEach(() => {
    repository = { read: vi.fn() };
    TestBed.configureTestingModule({ providers: [ReportDashboardStore, { provide: CHANNEL_REPORT_REPOSITORY, useValue: repository }] });
    session = TestBed.inject(UserSession);
    session.commit({ id: 'operator-1', roles: [UserRole.Operator] }, 'csrf');
    store = TestBed.inject(ReportDashboardStore);
    store.setActor();
  });

  it('does not request an absent or invalid URL and keeps both cases distinct', () => {
    store.bindUrl(convertToParamMap({}));
    expect(store.snapshot.loadState).toBe(ReportLoadState.Unselected);
    store.bindUrl(convertToParamMap({ fromDate: '2026-11-01' }));
    expect(store.snapshot.loadState).toBe(ReportLoadState.Invalid);
    expect(repository.read).not.toHaveBeenCalled();
  });

  it('clears a changed period, retains same-period refresh as stale and rejects a late actor response', () => {
    const first = new Subject<ChannelReport>(); repository.read.mockReturnValueOnce(first);
    const params = convertToParamMap({ fromDate: '2026-11-01', toDateExclusive: '2026-11-26' });
    store.bindUrl(params); expect(store.snapshot.loadState).toBe(ReportLoadState.Loading);
    const report = ReportMapper.envelope(reportEnvelopeFixture()); first.next(report); first.complete();
    expect(store.snapshot.report).toBe(report); expect(store.snapshot.loadState).toBe(ReportLoadState.Ready);

    const refresh = new Subject<ChannelReport>(); repository.read.mockReturnValueOnce(refresh);
    store.refresh(); expect(store.snapshot.report).toBe(report); expect(store.snapshot.loadState).toBe(ReportLoadState.Refreshing);
    refresh.error(new HttpErrorResponse({ status: 503 }));
    expect(store.snapshot.report).toBe(report); expect(store.snapshot.loadState).toBe(ReportLoadState.Stale);

    const late = new Subject<ChannelReport>(); repository.read.mockReturnValueOnce(late);
    store.refresh(); session.clear(); store.setActor(); late.next(report);
    expect(store.snapshot.report).toBeNull(); expect(store.snapshot.loadState).toBe(ReportLoadState.Denied);
  });

  it('clears report data on denial', () => {
    const request = new Subject<ChannelReport>(); repository.read.mockReturnValue(request);
    store.bindUrl(convertToParamMap({ fromDate: '2026-11-01', toDateExclusive: '2026-11-26' }));
    request.error(new HttpErrorResponse({ status: 403 }));
    expect(store.snapshot.report).toBeNull(); expect(store.snapshot.loadState).toBe(ReportLoadState.Denied);
  });
});
