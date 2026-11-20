import { Subject } from 'rxjs';
import { mapCustomerOrder } from '../../data/mappers/http-mappers';
import { CustomerOrder } from '../../domain/order/order.entity';
import { OrderStatus, PaymentStatus, ShipmentStatus } from '../../domain/order/commerce-states';
import { GetMyOrderUseCase } from '../../domain/order/use-cases/get-my-order.usecase';
import { CustomerOrderDetailStore } from './customer-order-detail.store';
import { CustomerOrderRefreshPhase } from './customer-order-refresh';

function order(id: string, paymentStatus: PaymentStatus): CustomerOrder {
  return {
    ...mapCustomerOrder({}), id, paymentStatus,
    orderStatus: paymentStatus === PaymentStatus.Approved ? OrderStatus.Paid : OrderStatus.PendingPayment,
    shipmentStatus: ShipmentStatus.Pending, tracking: null, total: 0, lines: [],
  };
}

describe('CustomerOrderDetailStore authoritative refresh', () => {
  it('preserves the snapshot, blocks duplicate clicks and publishes the authoritative result', () => {
    const initial = new Subject<CustomerOrder>();
    const refresh = new Subject<CustomerOrder>();
    const execute = vi.fn().mockReturnValueOnce(initial).mockReturnValueOnce(refresh);
    const store = new CustomerOrderDetailStore({ execute } as unknown as GetMyOrderUseCase);

    store.load('A'); initial.next(order('A', PaymentStatus.Pending)); store.refresh('A'); store.refresh('A');

    expect(execute).toHaveBeenCalledTimes(2);
    expect(store.snapshot.order?.paymentStatus).toBe(PaymentStatus.Pending);
    expect(store.snapshot.refreshPhase).toBe(CustomerOrderRefreshPhase.Refreshing);

    refresh.next(order('A', PaymentStatus.Approved));
    expect(store.snapshot.order?.paymentStatus).toBe(PaymentStatus.Approved);
    expect(store.snapshot.refreshPhase).toBe(CustomerOrderRefreshPhase.Succeeded);
    store.refresh('A'); expect(execute).toHaveBeenCalledTimes(2); store.ngOnDestroy();
  });

  it('keeps the last snapshot and exposes a retryable closed failure', () => {
    const initial = new Subject<CustomerOrder>();
    const refresh = new Subject<CustomerOrder>();
    const execute = vi.fn().mockReturnValueOnce(initial).mockReturnValueOnce(refresh);
    const store = new CustomerOrderDetailStore({ execute } as unknown as GetMyOrderUseCase);
    const pending = order('A', PaymentStatus.Pending);

    store.load('A'); initial.next(pending); store.refresh('A'); refresh.error(new Error('offline'));

    expect(store.snapshot.order).toEqual(pending);
    expect(store.snapshot.refreshPhase).toBe(CustomerOrderRefreshPhase.Failed);
    expect(store.snapshot.errorMessage).not.toBe(''); store.ngOnDestroy();
  });

  it('cancels an obsolete refresh when the route loads another order', () => {
    const initial = new Subject<CustomerOrder>();
    const refresh = new Subject<CustomerOrder>();
    const current = new Subject<CustomerOrder>();
    const execute = vi.fn().mockReturnValueOnce(initial).mockReturnValueOnce(refresh).mockReturnValueOnce(current);
    const store = new CustomerOrderDetailStore({ execute } as unknown as GetMyOrderUseCase);

    store.load('A'); initial.next(order('A', PaymentStatus.Pending)); store.refresh('A'); store.load('B');
    current.next(order('B', PaymentStatus.Pending)); refresh.next(order('A', PaymentStatus.Approved));

    expect(store.snapshot.order?.id).toBe('B');
    expect(store.snapshot.refreshPhase).toBe(CustomerOrderRefreshPhase.Idle); store.ngOnDestroy();
  });
});
