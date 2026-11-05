import type { DemoOrder, DemoCheckoutSnapshot } from './checkout-model';
import { DemoReservationState } from './demo-reservation-state';

/** Only an order's explicit reservation evidence can authorize release or consumption. */
export class DemoOrderReservations {
  static settle(order: DemoOrder, snapshot: DemoCheckoutSnapshot, consume: boolean): boolean {
    const reservation = order.reservation;
    if (!consume && reservation?.state === DemoReservationState.None) return false;
    if (reservation?.state !== DemoReservationState.Held || !reservation.lines.length) throw new Error('El pedido no cuenta con evidencia de una reserva propia.');
    if (reservation.lines.length !== order.lines.length || new Set(reservation.lines.map(line => JSON.stringify([line.sku, line.variantId]))).size !== reservation.lines.length || reservation.lines.some(line => !Number.isSafeInteger(line.quantity) || line.quantity <= 0 || !order.lines.some(purchased => purchased.sku === line.sku && purchased.variantId === line.variantId && purchased.quantity === line.quantity))) throw new Error('La reserva propia no coincide con el pedido.');
    const balances = reservation.lines.map(line => {
      const product = snapshot.products.find(value => value.sku === line.sku)!;
      const variant = product?.variants.find(value => value.id === line.variantId);
      if (!variant || variant.reserved < line.quantity || (consume && variant.onHand - line.quantity < variant.reserved - line.quantity + variant.notSellable)) throw new Error('El balance no permite aplicar la reserva propia.');
      return { line, product, variant };
    });
    for (const { line, product, variant } of balances) {
      variant.reserved -= line.quantity;
      if (consume) variant.onHand -= line.quantity;
      product.reserved = product.variants.reduce((sum, value) => sum + value.reserved, 0);
      product.onHand = product.variants.reduce((sum, value) => sum + value.onHand, 0);
    }
    reservation.state = consume ? DemoReservationState.Consumed : DemoReservationState.Released;
    return true;
  }
}
