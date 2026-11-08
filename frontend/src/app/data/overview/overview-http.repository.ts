import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { readApiBody } from '../../core/api/base-response';
import { FulfillmentItem, LowStockItem, OperatorOverview, OverviewFact, OverviewFactState, OverviewPeriod, OverviewQueue, OverviewShipmentState, OverviewUnavailableReason, PendingPaymentItem, PendingPaymentReason } from '../../domain/overview/overview';
import { IOverviewRepository } from '../../domain/overview/overview.repository';

function record(value: unknown, field = 'respuesta'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} no es válido.`);
  return value as Record<string, unknown>;
}
function text(row: Record<string, unknown>, key: string): string { const value = row[key]; if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} no es válido.`); return value.trim(); }
function number(row: Record<string, unknown>, key: string, integer = false): number {
  const value = row[key]; if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) throw new Error(`${key} no es válido.`); return value;
}
function instant(row: Record<string, unknown>, key: string): string { const value = text(row, key); if (Number.isNaN(Date.parse(value))) throw new Error(`${key} no es un instante válido.`); return value; }
function reason(row: Record<string, unknown>): OverviewUnavailableReason | null { const value = row['reason']; if (value === null || value === undefined) return null; if (typeof value !== 'string' || !value.trim()) throw new Error('reason no es válido.'); return OverviewUnavailableReason.fromWire(value); }
function fact(value: unknown): OverviewFact {
  const row = record(value, 'fact'); const state = OverviewFactState.fromWire(row['state']); const raw = row['value']; const why = reason(row);
  if (state === OverviewFactState.Known && (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0)) throw new Error('Un fact conocido requiere un valor válido.');
  if (state === OverviewFactState.Known && why !== null) throw new Error('Un fact conocido no puede declarar indisponibilidad.');
  if (state !== OverviewFactState.Known && raw !== null) throw new Error('Un fact no disponible no puede contener un valor.');
  if (state !== OverviewFactState.Known && why === null) throw new Error('Un fact no disponible requiere un motivo.');
  return { state, value: state === OverviewFactState.Known ? raw as number : null, reason: why };
}
function queue<T>(value: unknown, mapper: (row: Record<string, unknown>) => T): OverviewQueue<T> {
  const row = record(value, 'cola'); const state = OverviewFactState.fromWire(row['state']); const items = row['items'];
  if (!Array.isArray(items)) throw new Error('items no es válido.');
  if (state !== OverviewFactState.Known && items.length > 0) throw new Error('Una cola no disponible no puede exponer elementos.');
  const why = reason(row);
  const total = row['totalCount']; const truncated = row['truncated'];
  if (typeof truncated !== 'boolean') throw new Error('truncated no es válido.');
  if (state === OverviewFactState.Known && why !== null) throw new Error('Una cola conocida no puede declarar indisponibilidad.');
  if (state !== OverviewFactState.Known && why === null) throw new Error('Una cola no disponible requiere un motivo.');
  if (state === OverviewFactState.Known && (typeof total !== 'number' || !Number.isSafeInteger(total) || total < items.length || truncated !== (total > items.length))) throw new Error('El total de la cola no es consistente.');
  if (state !== OverviewFactState.Known && (total !== null || truncated)) throw new Error('Una cola no disponible no puede declarar totales.');
  return { state, items: state === OverviewFactState.Known ? items.map((item) => mapper(record(item, 'item'))) : [], totalCount: state === OverviewFactState.Known ? total as number : null, truncated, reason: why };
}
function pending(row: Record<string, unknown>): PendingPaymentItem { return { orderId: number(row, 'orderId', true), orderNumber: text(row, 'orderNumber'), total: number(row, 'total'), createdAt: instant(row, 'createdAt'), reason: PendingPaymentReason.fromWire(row['reason']) }; }
function fulfillment(row: Record<string, unknown>): FulfillmentItem { return { orderId: number(row, 'orderId', true), orderNumber: text(row, 'orderNumber'), total: number(row, 'total'), paidAt: instant(row, 'paidAt'), shipmentState: OverviewShipmentState.fromWire(row['shipmentState']) }; }
function lowStock(row: Record<string, unknown>): LowStockItem { return { variantId: number(row, 'variantId', true), sku: text(row, 'sku'), productName: text(row, 'productName'), variantLabel: text(row, 'variantLabel'), availableQuantity: number(row, 'availableQuantity', true), safetyStock: number(row, 'safetyStock', true) }; }

export function mapOperatorOverview(value: unknown): OperatorOverview {
  const row = record(value); const period = OverviewPeriod.fromWire(row['period']);
  return { period, timezone: text(row, 'timezone'), fromInclusive: instant(row, 'fromInclusive'), toExclusive: instant(row, 'toExclusive'),
    accreditedRevenue: fact(row['accreditedRevenue']), orderCount: fact(row['orderCount']), activeCustomerCount: fact(row['activeCustomerCount']), inventoryAtRiskCount: fact(row['inventoryAtRiskCount']),
    pendingPayments: queue(row['pendingPayments'], pending), fulfillment: queue(row['fulfillment'], fulfillment), lowStock: queue(row['lowStock'], lowStock) };
}

@Injectable()
export class OverviewHttpRepository implements IOverviewRepository {
  private readonly url = `${environment.apiBaseUrl}/user/overview`;
  constructor(private readonly http: HttpClient) {}
  read(period: OverviewPeriod): Observable<OperatorOverview> {
    if (period === OverviewPeriod.Unknown) throw new Error('El período del resumen no es válido.');
    return this.http.get<unknown>(this.url, { params: new HttpParams().set('period', period.wire) }).pipe(map((body) => mapOperatorOverview(readApiBody(body))));
  }
}
