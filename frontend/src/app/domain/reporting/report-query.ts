import { ReportExportQuery, ReportPeriodQuery } from './report';

function canonicalDate(raw: string | null): string | null {
  if (raw === null || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw ? raw : null;
}

export class ReportExportBoundary {
  private constructor(readonly query: ReportExportQuery) {}

  static create(fromDate: string | null, toDateExclusive: string | null, periodToken: string | null): ReportExportBoundary | null {
    const period = ReportQueryBoundary.create(fromDate, toDateExclusive);
    if (period === null || periodToken === null || !/^[0-9a-f]{64}$/.test(periodToken)) return null;
    return new ReportExportBoundary(Object.freeze({ ...period.query, periodToken }));
  }

  toUrlQuery(): Readonly<Record<string, string>> {
    return Object.freeze({
      fromDate: this.query.fromDate,
      toDateExclusive: this.query.toDateExclusive,
      periodToken: this.query.periodToken,
    });
  }
}

export class ReportQueryBoundary {
  private constructor(readonly query: ReportPeriodQuery) {}

  static create(fromDate: string | null, toDateExclusive: string | null): ReportQueryBoundary | null {
    const from = canonicalDate(fromDate);
    const to = canonicalDate(toDateExclusive);
    if (from === null || to === null) return null;
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
    return Number.isInteger(days) && days >= 1 && days <= 366
      ? new ReportQueryBoundary(Object.freeze({ fromDate: from, toDateExclusive: to }))
      : null;
  }

  static fromWire(params: ReadonlyMap<string, readonly string[]>): ReportQueryBoundary | null {
    if ([...params.keys()].some(key => !['fromDate', 'toDateExclusive'].includes(key))) return null;
    const from = params.get('fromDate');
    const to = params.get('toDateExclusive');
    if (from?.length !== 1 || to?.length !== 1) return null;
    return this.create(from[0], to[0]);
  }

  toUrlQuery(): Readonly<Record<string, string>> {
    return Object.freeze({ fromDate: this.query.fromDate, toDateExclusive: this.query.toDateExclusive });
  }
}
