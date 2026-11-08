import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { readApiBody } from '../../core/api/base-response';
import { FavoriteAvailability, FavoriteItem, FavoriteMutationOutcome, FavoriteMutationResult } from '../../domain/favorite/favorite';
import { IFavoriteRepository } from '../../domain/favorite/favorite.repository';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string { return typeof value === 'string' ? value : ''; }

export function mapFavorite(value: unknown): FavoriteItem {
  const row = record(value);
  const sku = text(row['sku']).trim();
  const name = text(row['name']).trim();
  const price = row['price'];
  const addedAt = text(row['addedAt']);
  if (!sku || !name || typeof price !== 'number' || !Number.isFinite(price) || price < 0 || !addedAt || Number.isNaN(Date.parse(addedAt))) {
    throw new Error('La lista de favoritos contiene una fila inválida.');
  }
  return {
    sku,
    name,
    price: Number.isFinite(price) ? price : 0,
    imageUrl: text(row['imageUrl']) || null,
    availability: FavoriteAvailability.fromWire(row['availability']),
    addedAt,
  };
}

export function mapFavoriteMutation(value: unknown): FavoriteMutationResult {
  const row = record(value);
  const sku = text(row['sku']).trim();
  if (!sku) throw new Error('La respuesta de favoritos no contiene un SKU válido.');
  return { sku, outcome: FavoriteMutationOutcome.fromWire(row['outcome']) };
}

@Injectable()
export class FavoriteHttpRepository implements IFavoriteRepository {
  private readonly url = `${environment.apiBaseUrl}/customer/favorites`;
  constructor(private readonly http: HttpClient) {}

  list(): Observable<readonly FavoriteItem[]> {
    return this.http.get<unknown>(this.url).pipe(map((body) => {
      const data = readApiBody<unknown>(body);
      if (!Array.isArray(data)) throw new Error('La lista de favoritos no es válida.');
      return data.map(mapFavorite);
    }));
  }

  add(sku: string): Observable<FavoriteMutationResult> {
    return this.http.put<unknown>(`${this.url}/${encodeURIComponent(sku)}`, {})
      .pipe(map((body) => mapFavoriteMutation(readApiBody<unknown>(body))));
  }

  remove(sku: string): Observable<FavoriteMutationResult> {
    return this.http.delete<unknown>(`${this.url}/${encodeURIComponent(sku)}`)
      .pipe(map((body) => mapFavoriteMutation(readApiBody<unknown>(body))));
  }
}
