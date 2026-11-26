import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, mergeMap, Observable, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ChannelReport, ChannelReportRepository, ReportExportFailure, ReportExportFailureKind, ReportExportFile, ReportExportQuery, ReportPeriodQuery } from '../../domain/reporting/report';
import { ReportExportBoundary, ReportQueryBoundary } from '../../domain/reporting/report-query';
import { ReportMapper } from './report.mapper';
import { ReportQueryAdapter } from './report-query.adapter';

@Injectable({ providedIn: 'root' })
export class ChannelReportHttpRepository extends ChannelReportRepository {
  private readonly endpoint = `${environment.apiBaseUrl}/user/channel-reports`;
  private readonly exportEndpoint = `${environment.apiBaseUrl}/user/channel-reports.csv`;

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

  export(query: ReportExportQuery): Observable<ReportExportFile> {
    const boundary = ReportExportBoundary.create(query.fromDate, query.toDateExclusive, query.periodToken);
    if (boundary === null) throw new Error('Solicitud de exportación inválida');
    const expectedFilename = `storecore-channel-report-${boundary.query.fromDate}-to-${boundary.query.toDateExclusive}.csv`;
    return this.http.get(this.exportEndpoint, {
      params: ReportQueryAdapter.toExportHttpParams(boundary),
      observe: 'response',
      responseType: 'blob',
    }).pipe(map(response => {
      const contentType = response.headers.get('Content-Type');
      const disposition = response.headers.get('Content-Disposition');
      if (!response.body || !contentType || !/^text\/csv(?:;\s*charset=UTF-8)?$/i.test(contentType) ||
          disposition !== `attachment; filename="${expectedFilename}"`) {
        throw new ReportExportFailure(ReportExportFailureKind.InvalidResponse);
      }
      return Object.freeze({ filename: expectedFilename, blob: response.body });
    }), catchError(error => this.translateExportFailure(error)));
  }

  private translateExportFailure(error: unknown): Observable<never> {
    if (error instanceof ReportExportFailure) return throwError(() => error);
    if (!(error instanceof HttpErrorResponse)) return throwError(() => new ReportExportFailure(ReportExportFailureKind.Unknown));
    if (error.status === 401 || error.status === 403) return throwError(() => new ReportExportFailure(ReportExportFailureKind.Denied));
    if (error.status === 0 || error.status === 502 || error.status === 503) return throwError(() => new ReportExportFailure(ReportExportFailureKind.Unavailable));
    if (!(error.error instanceof Blob)) return throwError(() => new ReportExportFailure(ReportExportFailureKind.Unknown));
    return this.readBlobText(error.error).pipe(mergeMap(text => {
      const code = this.errorCode(text);
      const kind = ReportExportFailureKind.fromWire(code);
      const correlated = (error.status === 409 && kind === ReportExportFailureKind.StalePeriod)
        || (error.status === 422 && kind === ReportExportFailureKind.TooLarge);
      return throwError(() => new ReportExportFailure(correlated ? kind : ReportExportFailureKind.Unknown));
    }));
  }

  private readBlobText(blob: Blob): Observable<string> {
    return new Observable(subscriber => {
      const reader = new FileReader();
      reader.onload = () => { subscriber.next(typeof reader.result === 'string' ? reader.result : ''); subscriber.complete(); };
      reader.onerror = () => subscriber.error(new ReportExportFailure(ReportExportFailureKind.Unknown));
      reader.readAsText(blob, 'UTF-8');
      return () => { if (reader.readyState === FileReader.LOADING) reader.abort(); };
    });
  }

  private errorCode(text: string): unknown {
    try {
      const decoded: unknown = JSON.parse(text);
      if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
      const record = decoded as Record<string, unknown>;
      return record['errorCode'] ?? record['code'] ?? null;
    } catch { return null; }
  }
}
