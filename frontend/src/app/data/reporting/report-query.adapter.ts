import { HttpParams } from '@angular/common/http';
import { ParamMap } from '@angular/router';
import { ReportExportBoundary, ReportQueryBoundary } from '../../domain/reporting/report-query';

export class ReportQueryAdapter {
  static fromUrl(params: ParamMap): ReportQueryBoundary | null {
    return ReportQueryBoundary.fromWire(new Map(params.keys.map(key => [key, params.getAll(key)])));
  }

  static toHttpParams(boundary: ReportQueryBoundary): HttpParams {
    return new HttpParams({ fromObject: boundary.toUrlQuery() });
  }

  static toExportHttpParams(boundary: ReportExportBoundary): HttpParams {
    return new HttpParams({ fromObject: boundary.toUrlQuery() });
  }
}
