import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { readApiBody } from '../../core/api/base-response';
import { AdjustAvailableStockCommand, InventoryAdjustmentOutcome, InventoryAdjustmentReceipt, InventoryAdjustmentResult } from '../../domain/user/inventory-adjustment';
import { IInventoryAdjustmentRepository } from '../../domain/user/inventory-adjustment.repository';
import { mapInventoryAdjustmentLookup, mapInventoryAdjustmentReceipt } from './inventory-adjustment.mapper';
@Injectable({ providedIn: 'root' })
export class InventoryAdjustmentHttpRepository implements IInventoryAdjustmentRepository {
  constructor(private readonly http: HttpClient) {}
  private url(command: AdjustAvailableStockCommand): string { return `${environment.apiBaseUrl}/user/inventory/${encodeURIComponent(command.variantId)}/adjustments`; }
  submit(command: AdjustAvailableStockCommand): Observable<InventoryAdjustmentReceipt> {
    const { commandId, quantityDelta, expected, reason } = command;
    return this.http.post<unknown>(this.url(command), { commandId, quantityDelta, expected, reason }).pipe(
      map(body => mapInventoryAdjustmentReceipt(readApiBody(body))),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && (error.status === 409 || error.status === 422)) {
          const envelope = error.error as { data?: unknown } | null;
          const receipt = mapInventoryAdjustmentReceipt(envelope?.data);
          if (receipt.outcome === InventoryAdjustmentOutcome.Rejected) return of(receipt);
        }
        return throwError(() => error);
      }),
    );
  }
  lookup(command: AdjustAvailableStockCommand): Observable<InventoryAdjustmentResult> { return this.http.get<unknown>(`${this.url(command)}/${encodeURIComponent(command.commandId)}`).pipe(map(body => mapInventoryAdjustmentLookup(readApiBody(body)))); }
  refreshCsrf(): Observable<void> { return this.http.get(`${environment.apiBaseUrl}/internal/auth/csrf`, { observe: 'response' }).pipe(map(() => undefined)); }
}
