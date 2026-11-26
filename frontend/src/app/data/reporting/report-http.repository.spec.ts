import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
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
});
