import { DemoRefundStatus, DemoReturnStatus, type DemoPostSaleOrder, type DemoReturnRequest } from './postsale-types';

export class DemoReturnPolicy {
  available(order: DemoPostSaleOrder, returns: readonly DemoReturnRequest[], variantId: string): number {
    const bought = order.lines.find(line => line.variantId === variantId)?.quantity ?? 0;
    const reserved = returns.filter(request => request.orderId === order.id && request.status.reservesQuantity)
      .flatMap(request => request.lines)
      .filter(line => line.variantId === variantId)
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
