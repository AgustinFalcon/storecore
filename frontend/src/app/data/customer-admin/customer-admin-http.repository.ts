import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { readApiBody } from '../../core/api/base-response';
import { AdminCustomer, CustomerAccountState, CustomerPage, CustomerQuery, CustomerStateTransition } from '../../domain/customer-admin/customer-admin';
import { ICustomerAdminRepository } from '../../domain/customer-admin/customer-admin.repository';

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(row: Record<string, unknown>, key: string): string {
  const value = row[key]; if (typeof value !== 'string' || !value.trim()) throw new Error(`El cliente no contiene ${key} válido.`); return value.trim();
}
function integer(row: Record<string, unknown>, key: string, minimum = 0): number {
  const value = row[key]; if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw new Error(`El cliente no contiene ${key} válido.`); return value;
}
function instantOrNull(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error(`El cliente no contiene ${field} válido.`);
  return value;
}

export function mapAdminCustomer(value: unknown): AdminCustomer {
  const row = record(value); const phone = row['phone'];
  if (phone !== null && phone !== undefined && typeof phone !== 'string') throw new Error('El cliente no contiene phone válido.');
  const createdAt = instantOrNull(row['createdAt'], 'createdAt');
  if (!createdAt) throw new Error('El cliente no contiene createdAt válido.');
  return {
    id: integer(row, 'id', 1), firstName: text(row, 'firstName'), lastName: text(row, 'lastName'), email: text(row, 'email'),
    phone: typeof phone === 'string' && phone.trim() ? phone.trim() : null, state: CustomerAccountState.fromWire(row['state']),
    createdAt,
    orderCount: integer(row, 'orderCount'), lastOrderAt: instantOrNull(row['lastOrderAt'], 'lastOrderAt'),
  };
}

function mapPage(value: unknown): CustomerPage {
  const row = record(value); const items = row['items'];
  if (!Array.isArray(items)) throw new Error('La lista de clientes no es válida.');
  return { items: items.map(mapAdminCustomer), page: integer(row, 'page'), pageSize: integer(row, 'pageSize', 1), total: integer(row, 'total') };
}

@Injectable()
export class CustomerAdminHttpRepository implements ICustomerAdminRepository {
  private readonly url = `${environment.apiBaseUrl}/user/customers`;
  constructor(private readonly http: HttpClient) {}
  list(query: CustomerQuery): Observable<CustomerPage> {
    let params = new HttpParams().set('page', query.page);
    if (query.query.trim()) params = params.set('query', query.query.trim());
    if (query.state) params = params.set('state', query.state.wire);
    return this.http.get<unknown>(this.url, { params }).pipe(map((body) => mapPage(readApiBody(body))));
  }
  get(id: number): Observable<AdminCustomer> {
    return this.http.get<unknown>(`${this.url}/${id}`).pipe(map((body) => mapAdminCustomer(readApiBody(body))));
  }
  transition(customer: AdminCustomer, transition: CustomerStateTransition): Observable<AdminCustomer> {
    if (transition === CustomerStateTransition.Unknown || customer.state === CustomerAccountState.Unknown || transition !== CustomerStateTransition.for(customer.state)) {
      throw new Error('La transición de cliente no es válida.');
    }
    return this.http.post<unknown>(`${this.url}/${customer.id}/state`, { state: transition.target.wire })
      .pipe(map((body) => mapAdminCustomer(readApiBody(body))));
  }
}
