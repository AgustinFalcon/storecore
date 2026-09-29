import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { readApiBody } from '../../core/api/base-response';
import { ShippingChoice } from '../../domain/order/closed-status';
import { ShippingSelection, ShippingSimStatus } from '../../domain/shipping/shipping.entity';
import { IShippingRepository } from '../../domain/shipping/shipping.repository';

@Injectable()
export class ShippingHttpRepository implements IShippingRepository {
  constructor(private readonly http: HttpClient) {}

  read(): Observable<ShippingSelection> {
    return this.http.get<unknown>(`${environment.apiBaseUrl}/customer/shipping`).pipe(map((body) => mapSelection(readApiBody(body))));
  }

  save(optionId: ShippingChoice): Observable<ShippingSelection> {
    return this.http
      .post<unknown>(`${environment.apiBaseUrl}/customer/shipping`, { optionId: optionId.code })
      .pipe(map((body) => mapSelection(readApiBody(body))));
  }

  saveLocation(latitude: number, longitude: number): Observable<ShippingSelection> {
    return this.http
      .post<unknown>(`${environment.apiBaseUrl}/customer/shipping/location`, { latitude, longitude })
      .pipe(map((body) => mapSelection(readApiBody(body))));
  }

  advance(status: ShippingSimStatus): Observable<ShippingSelection> {
    return this.http
      .post<unknown>(`${environment.apiBaseUrl}/customer/shipping/advance`, { status: status.code })
      .pipe(map((body) => mapSelection(readApiBody(body))));
  }
}

function mapSelection(body: unknown): ShippingSelection {
  const raw =
    body && typeof body === 'object'
      ? (body as {
          optionId?: unknown;
          status?: unknown;
          latitude?: unknown;
          longitude?: unknown;
          originLatitude?: unknown;
          originLongitude?: unknown;
        })
      : {};
  const option = raw.optionId === null || raw.optionId === undefined || raw.optionId === '' ? null : ShippingChoice.fromWire(raw.optionId);
  return {
    optionId: option,
    status: raw.status === null || raw.status === undefined || raw.status === '' ? ShippingSimStatus.Confirmed : ShippingSimStatus.fromWire(raw.status),
    latitude: coordinate(raw.latitude, -90, 90),
    longitude: coordinate(raw.longitude, -180, 180),
    originLatitude: coordinate(raw.originLatitude, -90, 90),
    originLongitude: coordinate(raw.originLongitude, -180, 180),
  };
}

function coordinate(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
}
