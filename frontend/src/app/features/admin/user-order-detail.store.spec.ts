import { Subject } from 'rxjs';
import { AdminOrder, OrderStatus, PaymentStatus, RmaTransition, ShipmentStatus, ShipmentTransition } from '../../domain/order/order.entity';
import { GetAdminOrderUseCase } from '../../domain/order/use-cases/get-admin-order.usecase';
import { AdvanceFulfillmentUseCase } from '../../domain/order/use-cases/advance-fulfillment.usecase';
import { UserOrderDetailStore } from './user-order-detail.store';

class TestOrderStore extends UserOrderDetailStore {
  snapshot() { return this.get(); }
}

function order(id: string): AdminOrder {
  return { id, orderStatus: OrderStatus.Paid, paymentStatus: PaymentStatus.Approved,
    shipmentStatus: ShipmentStatus.Preparing, rmaStatus: null, tracking: null, total: 0, lines: [] };
}

describe('UserOrderDetailStore route identity', () => {
  for (const mutation of ['ship', 'rma'] as const) {
    for (const outcome of ['success', 'error'] as const) {
      it('refreshes after late ' + mutation + ' ' + outcome + ' when navigation returns to A', () => {
        const reads = new Map<string, Subject<AdminOrder>>();
        const getAdmin = { execute: vi.fn((id: string) => {
          const response = new Subject<AdminOrder>();
          reads.set(id, response);
          return response;
        }) };
        const response = new Subject<AdminOrder>();
        const advance = { ship: vi.fn(() => response), rma: vi.fn(() => response) };
        const store = new TestOrderStore(getAdmin as unknown as GetAdminOrderUseCase, advance as unknown as AdvanceFulfillmentUseCase);
        store.load('A');
        reads.get('A')!.next(order('A'));
        if (mutation === 'ship') store.ship({ orderId: 'A', status: ShipmentTransition.Shipped, tracking: 'A-tracking' });
        else store.rma({ orderId: 'A', status: RmaTransition.Received });
        store.load('B');
        expect(store.snapshot().order).toBeNull();
        store.ship({ orderId: 'A', status: ShipmentTransition.Shipped, tracking: null });
        store.rma({ orderId: 'B', status: RmaTransition.Received });
        expect(advance[mutation]).toHaveBeenCalledTimes(1);
        expect(advance.ship).toHaveBeenCalledTimes(mutation === 'ship' ? 1 : 0);
        expect(advance.rma).toHaveBeenCalledTimes(mutation === 'rma' ? 1 : 0);
        reads.get('B')!.next(order('B'));
        store.load('A');
        const beforeCommitRead = reads.get('A')!;
        const before = store.snapshot();
        if (outcome === 'success') {
          response.next(order('A'));
          response.complete();
        }
        else response.error(new Error('old mutation failed'));
        expect(store.snapshot()).toEqual({ ...before, mutatingOrderIds: [] });
        expect(getAdmin.execute).toHaveBeenCalledTimes(4);
        expect(beforeCommitRead.observed).toBe(false);
        beforeCommitRead.next({ ...order('A'), tracking: 'STALE' });
        expect(store.snapshot().order).toBeNull();
        reads.get('A')!.next(order('A'));
        expect(store.snapshot().order?.id).toBe('A');
        expect(store.snapshot().errorMessage).toBe('');
        store.ngOnDestroy();
      });
    }
  }

  it('cancels earlier GETs and keeps the new failure free of old data', () => {
    const old = new Subject<AdminOrder>();
    const current = new Subject<AdminOrder>();
    const getAdmin = { execute: vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(current) };
    const store = new TestOrderStore(getAdmin as unknown as GetAdminOrderUseCase, {} as AdvanceFulfillmentUseCase);
    store.load('A');
    store.load('B');
    old.next(order('A'));
    expect(store.snapshot().order).toBeNull();
    current.error(new Error('B unavailable'));
    expect(store.snapshot().order).toBeNull();
    expect(store.snapshot().loading).toBe(false);
    expect(store.snapshot().errorMessage).not.toBe('');
    store.ngOnDestroy();
  });

  it('accepts a current mutation and rejects a concurrent second command', () => {
    const read = new Subject<AdminOrder>();
    const response = new Subject<AdminOrder>();
    const advance = { ship: vi.fn(() => response), rma: vi.fn(() => response) };
    const store = new TestOrderStore({ execute: () => read } as unknown as GetAdminOrderUseCase, advance as unknown as AdvanceFulfillmentUseCase);
    store.load('A');
    read.next(order('A'));
    store.ship({ orderId: 'A', status: ShipmentTransition.Shipped, tracking: 'CURRENT' });
    store.rma({ orderId: 'A', status: RmaTransition.Received });
    expect(advance.ship).toHaveBeenCalledOnce();
    expect(advance.rma).not.toHaveBeenCalled();
    response.next({ ...order('A'), shipmentStatus: ShipmentStatus.Shipped, tracking: 'CURRENT' });
    expect(store.snapshot().order?.tracking).toBe('CURRENT');
    expect(store.snapshot().loading).toBe(false);
    store.ngOnDestroy();
  });

  for (const mutation of ['ship', 'rma'] as const) {
    for (const outcome of ['success', 'error'] as const) {
      it('blocks both commands after A to B to A GET finishes before pending ' + mutation + ' ' + outcome, () => {
        const reads = new Map<string, Subject<AdminOrder>>();
        const getAdmin = { execute: vi.fn((id: string) => {
          const response = new Subject<AdminOrder>();
          reads.set(id, response);
          return response;
        }) };
        const pending = new Subject<AdminOrder>();
        const next = new Subject<AdminOrder>();
        const advance = { ship: vi.fn().mockReturnValue(pending), rma: vi.fn().mockReturnValue(pending) };
        const store = new TestOrderStore(getAdmin as unknown as GetAdminOrderUseCase, advance as unknown as AdvanceFulfillmentUseCase);
        let busy = false;
        const subscription = store.loading$.subscribe((value) => { busy = value; });
        store.load('A');
        reads.get('A')!.next(order('A'));
        if (mutation === 'ship') store.ship({ orderId: 'A', status: ShipmentTransition.Shipped, tracking: 'OLD' });
        else store.rma({ orderId: 'A', status: RmaTransition.Received });
        store.load('B');
        reads.get('B')!.next(order('B'));
        expect(busy).toBe(false);
        store.load('A');
        reads.get('A')!.next(order('A'));
        expect(store.snapshot().loading).toBe(false);
        expect(busy).toBe(true);
        store.ship({ orderId: 'A', status: ShipmentTransition.Shipped, tracking: null });
        store.rma({ orderId: 'A', status: RmaTransition.Received });
        expect(advance.ship).toHaveBeenCalledTimes(mutation === 'ship' ? 1 : 0);
        expect(advance.rma).toHaveBeenCalledTimes(mutation === 'rma' ? 1 : 0);
        if (outcome === 'success') {
          pending.next({ ...order('A'), tracking: 'OLD' });
          pending.complete();
        } else pending.error(new Error('old mutation failed'));
        expect(store.snapshot().order).toBeNull();
        expect(store.snapshot().errorMessage).toBe('');
        expect(store.snapshot().mutatingOrderIds).toEqual([]);
        expect(busy).toBe(true);
        expect(getAdmin.execute).toHaveBeenCalledTimes(4);
        store.rma({ orderId: 'A', status: RmaTransition.Received });
        expect(advance.rma).toHaveBeenCalledTimes(mutation === 'rma' ? 1 : 0);
        const committed = { ...order('A'), shipmentStatus: ShipmentStatus.Shipped, tracking: 'COMMITTED' };
        reads.get('A')!.next(committed);
        expect(store.snapshot().order).toEqual(committed);
        expect(busy).toBe(false);
        advance.rma.mockReturnValue(next);
        store.rma({ orderId: 'A', status: RmaTransition.Received });
        expect(advance.rma).toHaveBeenCalledTimes(mutation === 'rma' ? 2 : 1);
        next.complete();
        subscription.unsubscribe();
        store.ngOnDestroy();
      });
    }
  }

  it('keeps A busy while a separate shipment for B finishes', () => {
    const reads = new Map<string, Subject<AdminOrder>>();
    const posts = new Map([['A', new Subject<AdminOrder>()], ['B', new Subject<AdminOrder>()]]);
    const getAdmin = { execute: (id: string) => {
      const read = new Subject<AdminOrder>();
      reads.set(id, read);
      return read;
    } };
    const advance = { ship: vi.fn((id: string) => posts.get(id)!), rma: vi.fn() };
    const store = new TestOrderStore(getAdmin as unknown as GetAdminOrderUseCase, advance as unknown as AdvanceFulfillmentUseCase);
    store.load('A');
    reads.get('A')!.next(order('A'));
    store.ship({ orderId: 'A', status: ShipmentTransition.Shipped, tracking: null });
    store.load('B');
    reads.get('B')!.next(order('B'));
    store.ship({ orderId: 'B', status: ShipmentTransition.Shipped, tracking: null });
    expect(advance.ship).toHaveBeenCalledTimes(2);
    expect(posts.get('A')!.observed).toBe(true);
    expect(store.snapshot().mutatingOrderIds).toEqual(['A', 'B']);
    posts.get('B')!.next(order('B'));
    posts.get('B')!.complete();
    expect(store.snapshot().mutatingOrderIds).toEqual(['A']);
    posts.get('A')!.next(order('A'));
    posts.get('A')!.complete();
    expect(store.snapshot().mutatingOrderIds).toEqual([]);
    expect(store.snapshot().order?.id).toBe('B');
    store.ngOnDestroy();
  });

  it('leaves actions blocked if the post-mutation reconciliation fails', () => {
    const reads: Subject<AdminOrder>[] = [];
    const getAdmin = { execute: vi.fn(() => {
      const read = new Subject<AdminOrder>();
      reads.push(read);
      return read;
    }) };
    const pending = new Subject<AdminOrder>();
    const advance = { ship: vi.fn(() => pending), rma: vi.fn() };
    const store = new TestOrderStore(getAdmin as unknown as GetAdminOrderUseCase, advance as unknown as AdvanceFulfillmentUseCase);
    store.load('A');
    reads[0].next(order('A'));
    store.ship({ orderId: 'A', status: ShipmentTransition.Shipped, tracking: null });
    store.load('B');
    store.load('A');
    reads[2].next(order('A'));
    pending.complete();
    reads[3].error(new Error('refresh unavailable'));
    expect(store.snapshot().order).toBeNull();
    expect(store.snapshot().errorMessage).not.toBe('');
    store.rma({ orderId: 'A', status: RmaTransition.Received });
    expect(advance.rma).not.toHaveBeenCalled();
    store.ngOnDestroy();
  });

  it('does not refresh a disposed store with a pending mutation', () => {
    const read = new Subject<AdminOrder>();
    const pending = new Subject<AdminOrder>();
    const getAdmin = { execute: vi.fn(() => read) };
    const store = new TestOrderStore(getAdmin as unknown as GetAdminOrderUseCase,
      { ship: () => pending } as unknown as AdvanceFulfillmentUseCase);
    store.load('A');
    read.next(order('A'));
    store.ship({ orderId: 'A', status: ShipmentTransition.Shipped, tracking: null });
    store.load('A');
    store.ngOnDestroy();
    pending.complete();
    expect(getAdmin.execute).toHaveBeenCalledTimes(2);
  });
});
