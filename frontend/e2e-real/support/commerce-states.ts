abstract class ClosedCommerceState {
  protected constructor(readonly wire: string) {}
  protected static resolve<T extends ClosedCommerceState>(raw: unknown, values: readonly T[], unknown: T): T {
    return values.find(value => value.wire === raw) ?? unknown;
  }
}

export class CommercePaymentState extends ClosedCommerceState {
  private constructor(wire: string) { super(wire); }
  static readonly Pending = new CommercePaymentState('PENDING');
  static readonly Approved = new CommercePaymentState('APPROVED');
  static readonly Unknown = new CommercePaymentState('UNKNOWN');
  static readonly values = [this.Pending, this.Approved] as const;
  static fromWire(raw: unknown): CommercePaymentState { return this.resolve(raw, this.values, this.Unknown); }
}

export class CommerceShipmentState extends ClosedCommerceState {
  private constructor(wire: string) { super(wire); }
  static readonly Pending = new CommerceShipmentState('PENDING');
  static readonly Preparing = new CommerceShipmentState('PREPARING');
  static readonly Shipped = new CommerceShipmentState('SHIPPED');
  static readonly Delivered = new CommerceShipmentState('DELIVERED');
  static readonly ReadyForPickup = new CommerceShipmentState('READY_FOR_PICKUP');
  static readonly PickedUp = new CommerceShipmentState('PICKED_UP');
  static readonly Unknown = new CommerceShipmentState('UNKNOWN');
  static readonly values = [this.Pending, this.Preparing, this.Shipped, this.Delivered, this.ReadyForPickup, this.PickedUp] as const;
  static fromWire(raw: unknown): CommerceShipmentState { return this.resolve(raw, this.values, this.Unknown); }
}

export class CommerceDispositionState extends ClosedCommerceState {
  private constructor(wire: string) { super(wire); }
  static readonly Confirmed = new CommerceDispositionState('CONFIRMED');
  static readonly Unknown = new CommerceDispositionState('UNKNOWN');
  static readonly values = [this.Confirmed] as const;
  static fromWire(raw: unknown): CommerceDispositionState { return this.resolve(raw, this.values, this.Unknown); }
}
