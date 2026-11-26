import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { ReportExportFailure, ReportExportFailureKind } from '../../domain/reporting/report';
import { ChannelReportHttpRepository } from './report-http.repository';
import { reportEnvelopeFixture } from './report.spec-fixtures';

describe('ChannelReportHttpRepository', () => {
  const record = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;
  let repository: ChannelReportHttpRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ChannelReportHttpRepository] });
    repository = TestBed.inject(ChannelReportHttpRepository);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('sends only canonical dates and correlates the returned period', () => {
    let count: string | undefined;
    repository.read({ fromDate: '2026-11-01', toDateExclusive: '2026-11-26' }).subscribe(report => count = report.metrics.createdOrders.value?.count);
    const request = http.expectOne(req => req.url === `${environment.apiBaseUrl}/user/channel-reports`);
    expect(request.request.params.keys().sort()).toEqual(['fromDate', 'toDateExclusive']);
    expect(request.request.params.get('fromDate')).toBe('2026-11-01');
    request.flush(reportEnvelopeFixture());
    expect(count).toBe('2');
  });

  it('rejects an invalid request before HTTP and a noncorrelated response at the boundary', () => {
    expect(() => repository.read({ fromDate: 'bad', toDateExclusive: '2026-11-26' })).toThrow();
    http.expectNone(`${environment.apiBaseUrl}/user/channel-reports`);

    let failure: unknown;
    repository.read({ fromDate: '2026-11-01', toDateExclusive: '2026-11-26' }).subscribe({ error: error => failure = error });
    const request = http.expectOne(`${environment.apiBaseUrl}/user/channel-reports?fromDate=2026-11-01&toDateExclusive=2026-11-26`);
    const raw = structuredClone(reportEnvelopeFixture());
    record(record(record(raw)['data'])['period'])['fromDate'] = '2026-11-02';
    request.flush(raw);
    expect(failure).toBeTruthy();
  });

  it('downloads only the server CSV correlated to the exact period token', () => {
    let filename = '';
    repository.export({ fromDate: '2026-11-01', toDateExclusive: '2026-11-26', periodToken: 'a'.repeat(64) })
      .subscribe(file => filename = file.filename);
    const request = http.expectOne(req => req.url === `${environment.apiBaseUrl}/user/channel-reports.csv`);
    expect(request.request.params.keys().sort()).toEqual(['fromDate', 'periodToken', 'toDateExclusive']);
    expect(request.request.params.get('periodToken')).toBe('a'.repeat(64));
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['recordKind,metric\r\nMETA,\r\n']), { headers: {
      'Content-Type': 'text/csv;charset=UTF-8',
      'Content-Disposition': 'attachment; filename="storecore-channel-report-2026-11-01-to-2026-11-26.csv"',
    } });
    expect(filename).toBe('storecore-channel-report-2026-11-01-to-2026-11-26.csv');
  });

  it('rejects an invalid export token before HTTP and unsafe response metadata', () => {
    expect(() => repository.export({ fromDate: '2026-11-01', toDateExclusive: '2026-11-26', periodToken: 'bad' })).toThrow();
    http.expectNone(`${environment.apiBaseUrl}/user/channel-reports.csv`);

    let failure: unknown;
    repository.export({ fromDate: '2026-11-01', toDateExclusive: '2026-11-26', periodToken: 'b'.repeat(64) })
      .subscribe({ error: error => failure = error });
    const request = http.expectOne(req => req.url === `${environment.apiBaseUrl}/user/channel-reports.csv`);
    request.flush(new Blob(['bad']), { headers: {
      'Content-Type': 'text/html',
      'Content-Disposition': 'attachment; filename="../../unsafe.csv"',
    } });
    expect(failure).toBeInstanceOf(ReportExportFailure);
    expect((failure as ReportExportFailure).kind).toBe(ReportExportFailureKind.InvalidResponse);
  });

  it('decodes only status-correlated closed Blob errors and fails malformed errors closed', async () => {
    const failures: ReportExportFailure[] = [];
    repository.export({ fromDate: '2026-11-01', toDateExclusive: '2026-11-26', periodToken: 'c'.repeat(64) })
      .subscribe({ error: error => failures.push(error) });
    http.expectOne(req => req.url.endsWith('/user/channel-reports.csv')).flush(
      new Blob([JSON.stringify({ errorCode: 'REPORT_PERIOD_STALE' })], { type: 'application/json' }),
      { status: 409, statusText: 'Conflict' },
    );
    await vi.waitFor(() => expect(failures).toHaveLength(1));
    expect(failures[0].kind).toBe(ReportExportFailureKind.StalePeriod);

    repository.export({ fromDate: '2026-11-01', toDateExclusive: '2026-11-26', periodToken: 'd'.repeat(64) })
      .subscribe({ error: error => failures.push(error) });
    http.expectOne(req => req.url.endsWith('/user/channel-reports.csv')).flush(
      new Blob([JSON.stringify({ errorCode: 'SOMETHING_ELSE' })], { type: 'application/json' }),
      { status: 409, statusText: 'Conflict' },
    );
    await vi.waitFor(() => expect(failures).toHaveLength(2));
    expect(failures[1].kind).toBe(ReportExportFailureKind.Unknown);
  });
});
