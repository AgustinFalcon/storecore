import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { readApiBody } from '../../core/api/base-response';
import { ConfirmDispositionCommand, ReturnDisposition } from '../../domain/order/return-disposition';
import { IReturnDispositionRepository } from '../../domain/order/return-disposition.repository';
import { mapReturnDisposition } from './return-disposition.mapper';

@Injectable()
export class ReturnDispositionHttpRepository implements IReturnDispositionRepository {
  constructor(private readonly http: HttpClient) {}
  read(orderId: string): Observable<ReturnDisposition> {
    return this.http.get<unknown>(this.url(orderId)).pipe(map(body => mapReturnDisposition(readApiBody<unknown>(body))));
  }
  confirm(orderId: string, command: ConfirmDispositionCommand): Observable<ReturnDisposition> {
    return this.http.post<unknown>(this.url(orderId), { idempotencyKey: command.idempotencyKey, lines: command.lines.map(line => ({ ...line, damageReason: line.damageReason?.wire ?? null, rejectionReason: line.rejectionReason?.wire ?? null, observation: line.observation.trim() || null })) }).pipe(map(body => mapReturnDisposition(readApiBody<unknown>(body))));
  }
  private url(orderId: string): string { return `${environment.apiBaseUrl}/user/orders/${encodeURIComponent(orderId)}/return-disposition`; }
}
