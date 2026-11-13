import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CartCurrency } from '../../domain/cart/cart-currency';
import { CartHttpRepository } from './cart-http.repository';

describe('CartHttpRepository', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), CartHttpRepository],
    });
  });

  it('serializes the closed currency at the HTTP boundary without leaking the domain object', async () => {
    const repo = TestBed.inject(CartHttpRepository);
    const http = TestBed.inject(HttpTestingController);
    const pending = firstValueFrom(repo.checkout({
      idempotencyKey: 'attempt-1',
      addressId: 'address-1',
      currency: CartCurrency.Ars,
    }));

    const request = http.expectOne('/api/v1/customer/checkout');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      idempotencyKey: 'attempt-1',
      addressId: 'address-1',
      currency: 'ARS',
    });
    request.flush({ orderId: 'order-1', paymentStatus: 'PENDING', orderStatus: 'PENDING_PAYMENT' });
    await pending;
  });
});
