export class AddressReturnTarget {
  static readonly Checkout = new AddressReturnTarget('checkout', 'Volver al checkout', '/checkout');
  static readonly Unknown = new AddressReturnTarget('unknown', '', null);

  private constructor(readonly wire: string, readonly label: string, readonly path: string | null) {}

  static fromWire(raw: unknown): AddressReturnTarget {
    return raw === AddressReturnTarget.Checkout.wire ? AddressReturnTarget.Checkout : AddressReturnTarget.Unknown;
  }
}
