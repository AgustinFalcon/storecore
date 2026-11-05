import { PaymentStatus, ShipmentStatus } from '../../domain/order/commerce-states';

/** Only new checkout and explicit pending-payment decisions use this policy. */
export class DemoPaymentShipmentPolicy {
  static forPayment(payment: PaymentStatus): ShipmentStatus {
    if (payment === PaymentStatus.Approved) return ShipmentStatus.Preparing;
    if (payment === PaymentStatus.Pending) return ShipmentStatus.Pending;
    if (payment === PaymentStatus.Rejected || payment === PaymentStatus.Cancelled) return ShipmentStatus.Cancelled;
    return ShipmentStatus.Unknown;
  }
}
