import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { readApiBody } from '../../core/api/base-response';
import { CreateOfferCommand, DiscountKind, Offer, OfferStatus, OfferTransition } from '../../domain/offer/offer';
import { IOfferRepository } from '../../domain/offer/offer.repository';

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function requiredText(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`La oferta no contiene ${key} válido.`);
  return value.trim();
}
function finite(row: Record<string, unknown>, key: string, minimum = 0): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) throw new Error(`La oferta no contiene ${key} válido.`);
  return value;
}
function instant(row: Record<string, unknown>, key: string): string {
  const value = requiredText(row, key);
  if (Number.isNaN(Date.parse(value))) throw new Error(`La oferta no contiene ${key} válido.`);
  return value;
}

export function mapOffer(value: unknown): Offer {
  const row = record(value);
  const rawSkus = row['skus'];
  if (!Array.isArray(rawSkus) || rawSkus.length === 0 || rawSkus.some((sku) => typeof sku !== 'string' || !sku.trim())) {
    throw new Error('La oferta no contiene productos válidos.');
  }
  const approvedAt = row['approvedAt'];
  if (approvedAt !== null && approvedAt !== undefined && (typeof approvedAt !== 'string' || Number.isNaN(Date.parse(approvedAt)))) {
    throw new Error('La oferta no contiene una aprobación válida.');
  }
  return {
    id: finite(row, 'id', 1), name: requiredText(row, 'name'), status: OfferStatus.fromWire(row['status']),
    priority: finite(row, 'priority'), startsAt: instant(row, 'startsAt'), endsAt: instant(row, 'endsAt'),
    discountKind: DiscountKind.fromWire(row['discountKind']), discountValue: finite(row, 'discountValue', Number.MIN_VALUE),
    minMarginPercent: finite(row, 'minMarginPercent'), skus: rawSkus.map((sku) => String(sku).trim()),
    createdAt: instant(row, 'createdAt'), approvedAt: approvedAt ? String(approvedAt) : null,
  };
}

@Injectable()
export class OfferHttpRepository implements IOfferRepository {
  private readonly url = `${environment.apiBaseUrl}/user/offers`;
  constructor(private readonly http: HttpClient) {}
  list(): Observable<readonly Offer[]> {
    return this.http.get<unknown>(this.url).pipe(map((body) => {
      const rows = readApiBody<unknown>(body);
      if (!Array.isArray(rows)) throw new Error('La lista de ofertas no es válida.');
      return rows.map(mapOffer);
    }));
  }
  create(command: CreateOfferCommand): Observable<Offer> {
    const payload = { ...command, discountKind: command.discountKind.wire };
    return this.http.post<unknown>(this.url, payload).pipe(map((body) => mapOffer(readApiBody(body))));
  }
  transition(id: number, transition: OfferTransition): Observable<Offer> {
    return this.http.post<unknown>(`${this.url}/${id}/state`, { transition: transition.wire })
      .pipe(map((body) => mapOffer(readApiBody(body))));
  }
}
