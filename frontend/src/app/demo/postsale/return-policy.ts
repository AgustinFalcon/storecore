import { DemoRefundStatus, DemoReturnStatus, demoReturnLineKey, type DemoPostSaleOrder, type DemoReturnRequest } from './postsale-types';

export class DemoReturnPolicy {
  available(order: DemoPostSaleOrder, returns: readonly DemoReturnRequest[], sku: string, variantId: string): number {
    const identity = demoReturnLineKey({ sku, variantId });
    const bought = order.lines.find(line => demoReturnLineKey(line) === identity)?.quantity ?? 0;
    const reserved = returns.filter(request => request.orderId === order.id && request.status.reservesQuantity)
      .flatMap(request => request.lines)
      .filter(line => demoReturnLineKey(line) === identity)
      .reduce((sum, line) => sum + line.quantity, 0);
    return bought - reserved;
  }

  refunded(order: DemoPostSaleOrder, returns: readonly DemoReturnRequest[]): number {
    return returns.filter(request => request.orderId === order.id && request.status === DemoReturnStatus.Refunded)
      .reduce((sum, request) => sum + request.refundedAmount, 0);
  }

  merchandiseTotal(order: DemoPostSaleOrder): number { return order.lines.reduce((sum, line) => sum + line.unit * line.quantity, 0); }

  refundStatus(order: DemoPostSaleOrder, returns: readonly DemoReturnRequest[]): DemoRefundStatus {
    return DemoRefundStatus.fromAmounts(this.refunded(order, returns), this.merchandiseTotal(order));
  }
}
