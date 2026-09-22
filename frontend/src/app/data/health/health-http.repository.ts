import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { readApiBody } from '../../core/api/base-response';
import { Health } from '../../domain/health/health.entity';
import { IHealthRepository } from '../../domain/health/health.repository';

@Injectable()
export class HealthHttpRepository implements IHealthRepository {
  constructor(private readonly http: HttpClient) {}

  read(): Observable<Health> {
    return this.http.get<unknown>(`${environment.apiBaseUrl}/health`).pipe(map((body) => readApiBody<Health>(body)));
  }
}
