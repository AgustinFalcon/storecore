import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { firstValueFrom, of, Subject, throwError } from 'rxjs';
import { mapAdminOrder } from '../../data/mappers/http-mappers';
import { ShipmentStatus, ShipmentTransition } from '../../domain/order/commerce-states';
import { allowedShipment } from '../../domain/order/fulfillment-transition';
import { AdminOrder } from '../../domain/order/order.entity';
import { AdvanceFulfillmentUseCase } from '../../domain/order/use-cases/advance-fulfillment.usecase';
import { ListAdminOrdersUseCase } from '../../domain/order/use-cases/list-admin-orders.usecase';
import { FulfillmentStore } from './fulfillment.store';

describe('FulfillmentStore authoritative reload', () => {
  it('reloads after ambiguous transport failure and serializes in-flight mutations', async () => {
    const injector = createEnvironmentInjector([], null as unknown as EnvironmentInjector);
    const response = new Subject<AdminOrder>();
    const authoritative = mapAdminOrder({ deliveryDecision:{state:'LEGACY_MISSING_BLOCK',value:null}, id: '1', orderStatus: 'PAID', paymentStatus: 'APPROVED', payment: { state: 'KNOWN', value: 'APPROVED', reason: null }, shipmentStatus: 'PREPARING', rmaStatus: 'NONE', fulfillmentEligibility: 'ELIGIBLE', shipmentAction: 'SHIPPED' });
    const read = vi.fn(() => of({ items: [authoritative], page: 0, size: 25, total: 1, truncated: false }));
    const send = vi.fn(() => response);
    const store = runInInjectionContext(injector, () => new FulfillmentStore({ execute: read } as unknown as ListAdminOrdersUseCase, { ship: send } as unknown as AdvanceFulfillmentUseCase));
    try {
      const command = { orderId: '1', status: ShipmentTransition.Packed, tracking: null };
      store.ship(command);
      store.ship(command);
      expect(send).toHaveBeenCalledTimes(1);
      response.error(new Error('transport timeout'));
      expect(read).toHaveBeenCalledTimes(1);
      expect(await firstValueFrom(store.orders$)).toEqual([authoritative]);
      expect(await firstValueFrom(store.loading$)).toBe(false);
    } finally { store.ngOnDestroy(); injector.destroy(); }
  });
  it('invalidates an actionable prior snapshot until an authoritative GET succeeds', async () => {
    const injector = createEnvironmentInjector([], null as unknown as EnvironmentInjector);
    const stale = mapAdminOrder({ deliveryDecision:{state:'LEGACY_MISSING_BLOCK',value:null}, id: '1', orderStatus: 'PAID', paymentStatus: 'APPROVED', payment: { state: 'KNOWN', value: 'APPROVED', reason: null }, shipmentStatus: 'PENDING', rmaStatus: 'NONE', fulfillmentEligibility: 'ELIGIBLE', shipmentAction: 'PACKED' });
    const authoritative = { ...stale, shipmentStatus: ShipmentStatus.Preparing, shipmentAction: ShipmentTransition.Shipped };
    const failedReload = new Subject<unknown>();
    const retryReload = new Subject<unknown>();
    const read = vi.fn().mockReturnValueOnce(of({ items: [stale], page: 0, size: 25, total: 1, truncated: false })).mockReturnValueOnce(failedReload).mockReturnValueOnce(retryReload);
    const store = runInInjectionContext(injector, () => new FulfillmentStore({ execute: read } as unknown as ListAdminOrdersUseCase, { ship: () => throwError(() => new Error('timeout')) } as unknown as AdvanceFulfillmentUseCase));
    try {
      store.load();
      expect(await firstValueFrom(store.orders$)).toEqual([stale]);
      expect(allowedShipment(stale)).toBe(ShipmentTransition.Packed);
      store.ship({ orderId: '1', status: ShipmentTransition.Packed, tracking: null });
      expect(await firstValueFrom(store.loading$)).toBe(true);
      expect(await firstValueFrom(store.orders$)).toEqual([]);
      failedReload.error(new Error('offline'));
      expect(await firstValueFrom(store.loading$)).toBe(false);
      expect(await firstValueFrom(store.orders$)).toEqual([]);
      store.load();
      expect(await firstValueFrom(store.loading$)).toBe(true);
      expect(await firstValueFrom(store.orders$)).toEqual([]);
      retryReload.next({ items: [authoritative], page: 0, size: 25, total: 1, truncated: false });
      expect(await firstValueFrom(store.orders$)).toEqual([authoritative]);
      expect(allowedShipment(authoritative)).toBe(ShipmentTransition.Shipped);
      expect(await firstValueFrom(store.loading$)).toBe(false);
    } finally { store.ngOnDestroy(); injector.destroy(); }
  });
});
