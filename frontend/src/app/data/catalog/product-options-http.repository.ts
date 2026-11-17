import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { readApiBody } from '../../core/api/base-response';
import { AdminProductOptionsMapper, AdminProductOptionsSnapshot, ProductOptionsCommand, ProductOptionsWriteResult } from '../../domain/catalog/admin-product-options';
import { IProductOptionsRepository } from '../../domain/catalog/product-options.repository';
import { environment } from '../../../environments/environment';

@Injectable()
export class ProductOptionsHttpRepository implements IProductOptionsRepository {
  constructor(private readonly http: HttpClient) {}
  read(sku: string): Observable<AdminProductOptionsSnapshot> {
    return this.http.get<unknown>(`${environment.apiBaseUrl}/user/catalog/products/${encodeURIComponent(sku)}/options`)
      .pipe(map(body => AdminProductOptionsMapper.fromWire(readApiBody(body))));
  }
  write(sku: string, command: ProductOptionsCommand): Observable<ProductOptionsWriteResult> {
    return this.http.put<unknown>(`${environment.apiBaseUrl}/user/catalog/products/${encodeURIComponent(sku)}/options`, {
      expectedRevision: command.expectedRevision, operation: command.operation.wire, axes: command.axes,
      assignments: command.assignments, variantOperations: command.variantOperations,
    }).pipe(map(body => AdminProductOptionsMapper.writeResult(readApiBody(body))));
  }
}
