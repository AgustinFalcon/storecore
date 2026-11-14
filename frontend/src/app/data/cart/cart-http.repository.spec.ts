import { DeliveryMode } from '../../domain/cart/delivery';
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
  it('omits an old address for pickup and sends only the quoted mode/version identity', async () => {
    const repo=TestBed.inject(CartHttpRepository), http=TestBed.inject(HttpTestingController);
    const pending=firstValueFrom(repo.checkout({cartRevision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', addressRevision: '2026-11-14T00:00:00Z', idempotencyKey:'pickup-key',deliveryMode:DeliveryMode.Pickup,deliveryConfigurationVersion:9,addressId:'residual-address',currency:CartCurrency.Ars}));
    const request=http.expectOne('/api/v1/customer/checkout');
    expect(request.request.body).toEqual({cartRevision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', idempotencyKey:'pickup-key',deliveryMode:DeliveryMode.Pickup.wire,deliveryConfigurationVersion:9,currency:CartCurrency.Ars.wire});
    request.flush({orderId:'pickup-order',paymentStatus:'PENDING',orderStatus:'PENDING_PAYMENT'});await pending;
  });

  it('serializes the closed currency at the HTTP boundary without leaking the domain object', async () => {
    const repo = TestBed.inject(CartHttpRepository);
    const http = TestBed.inject(HttpTestingController);
    const pending = firstValueFrom(repo.checkout({
      cartRevision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', addressRevision: '2026-11-14T00:00:00Z', deliveryMode: DeliveryMode.LocalDelivery, deliveryConfigurationVersion: 2, idempotencyKey: 'attempt-1',
      addressId: 'address-1',
      currency: CartCurrency.Ars,
    }));

    const request = http.expectOne('/api/v1/customer/checkout');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      cartRevision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', addressRevision: '2026-11-14T00:00:00Z', deliveryMode: DeliveryMode.LocalDelivery.wire, deliveryConfigurationVersion: 2, idempotencyKey: 'attempt-1',
      addressId: 'address-1',
      currency: 'ARS',
    });
    request.flush({ orderId: 'order-1', paymentStatus: 'PENDING', orderStatus: 'PENDING_PAYMENT' });
    await pending;
  });
});
