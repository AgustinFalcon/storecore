import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ChannelReport, ChannelReportRepository, ReportPeriodQuery } from '../../domain/reporting/report';
import { ReportQueryBoundary } from '../../domain/reporting/report-query';
import { ReportMapper } from './report.mapper';
import { ReportQueryAdapter } from './report-query.adapter';

@Injectable({ providedIn: 'root' })
export class ChannelReportHttpRepository extends ChannelReportRepository {
  private readonly endpoint = `${environment.apiBaseUrl}/user/channel-reports`;

  constructor(private readonly http: HttpClient) { super(); }

  read(query: ReportPeriodQuery): Observable<ChannelReport> {
    const boundary = ReportQueryBoundary.create(query.fromDate, query.toDateExclusive);
    if (boundary === null) throw new Error('Período de reporte inválido');
    return this.http.get<unknown>(this.endpoint, { params: ReportQueryAdapter.toHttpParams(boundary) }).pipe(
      map(raw => {
        const report = ReportMapper.envelope(raw);
        if (report.period.fromDate !== boundary.query.fromDate || report.period.toDateExclusive !== boundary.query.toDateExclusive) {
          throw new Error('Período de reporte no correlacionado');
        }
        return report;
      }),
    );
  }
}
