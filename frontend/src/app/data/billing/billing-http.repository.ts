import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { readApiBody } from '../../core/api/base-response';
import { BillingProfile, TaxCondition } from '../../domain/billing/billing.entity';
import { IBillingRepository } from '../../domain/billing/billing.repository';

const CONDITIONS = new Set<TaxCondition>(['CONSUMIDOR_FINAL', 'MONOTRIBUTO', 'RESPONSABLE_INSCRIPTO', 'EXENTO']);

@Injectable()
export class BillingHttpRepository implements IBillingRepository {
  constructor(private readonly http: HttpClient) {}

  read(): Observable<BillingProfile> {
    return this.http.get<unknown>(`${environment.apiBaseUrl}/customer/billing`).pipe(map((body) => mapProfile(readApiBody(body))));
  }

  save(profile: Pick<BillingProfile, 'legalName' | 'taxId' | 'taxCondition'>): Observable<BillingProfile> {
    return this.http
      .put<unknown>(`${environment.apiBaseUrl}/customer/billing`, profile)
      .pipe(map((body) => mapProfile(readApiBody(body))));
  }
}

function mapProfile(value: unknown): BillingProfile {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const condition = String(row['taxCondition'] ?? '');
  return {
    legalName: String(row['legalName'] ?? ''),
    taxId: String(row['taxId'] ?? ''),
    taxCondition: CONDITIONS.has(condition as TaxCondition) ? (condition as TaxCondition) : 'CONSUMIDOR_FINAL',
    documentStatus: row['documentStatus'] === 'ISSUED' ? 'ISSUED' : 'NOT_ISSUED',
  };
}
