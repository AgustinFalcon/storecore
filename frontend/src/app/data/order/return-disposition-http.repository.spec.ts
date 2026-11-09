import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { DamageReason, ReturnDispositionState } from '../../domain/order/return-disposition';
import { ReturnDispositionHttpRepository } from './return-disposition-http.repository';

describe('Return disposition HTTP contract', () => {
  it('reads only the USER endpoint and translates the response at the boundary', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ReturnDispositionHttpRepository] });
    const controller = TestBed.inject(HttpTestingController);
    let result = ReturnDispositionState.Unknown;
    TestBed.inject(ReturnDispositionHttpRepository).read('12').subscribe(value => result = value.state);
    const request = controller.expectOne(`${environment.apiBaseUrl}/user/orders/12/return-disposition`);
    expect(request.request.method).toBe('GET');
    request.flush({ code: 200, data: { orderId: '12', returnId: null, state: 'UNAVAILABLE', lines: [], result: null } });
    expect(result).toBe(ReturnDispositionState.Unavailable); controller.verify();
  });
  it('serializes closed reasons and never submits actor or aggregate status', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ReturnDispositionHttpRepository] });
    const controller = TestBed.inject(HttpTestingController);
    TestBed.inject(ReturnDispositionHttpRepository).confirm('12', { idempotencyKey: '12345678-1234-1234-1234-123456789012', lines: [{ returnItemId: '5', restockQuantity: 0, damagedQuantity: 2, rejectedQuantity: 0, damageReason: DamageReason.Functional, rejectionReason: null, observation: '  Falla comprobada  ' }] }).subscribe();
    const request = controller.expectOne(`${environment.apiBaseUrl}/user/orders/12/return-disposition`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ idempotencyKey: '12345678-1234-1234-1234-123456789012', lines: [{ returnItemId: '5', restockQuantity: 0, damagedQuantity: 2, rejectedQuantity: 0, damageReason: DamageReason.Functional.wire, rejectionReason: null, observation: 'Falla comprobada' }] });
    request.flush({ code: 200, data: { orderId: '12', returnId: null, state: 'UNAVAILABLE', lines: [], result: null } }); controller.verify();
  });
});
