export class CartFailureKind {
  static readonly None = new CartFailureKind('NONE', '', false);
  static readonly Load = new CartFailureKind('LOAD', 'No pudimos cargar el carrito.', true);
  static readonly CurrencyUnavailable = new CartFailureKind('CURRENCY_UNAVAILABLE', 'Moneda no disponible', false);
  static readonly Unknown = new CartFailureKind('UNKNOWN', 'Carrito no disponible', true);

  private constructor(readonly wire: string, readonly label: string, readonly readFailure: boolean) {}

  static fromWire(value: unknown): CartFailureKind {
    return [this.None, this.Load, this.CurrencyUnavailable].find((state) => state.wire === value) ?? this.Unknown;
  }
}
