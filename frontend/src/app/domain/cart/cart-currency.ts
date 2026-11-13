export class CartCurrency {
  static readonly Ars = new CartCurrency('ARS', 'Pesos argentinos (ARS)', true);
  static readonly Unknown = new CartCurrency('UNKNOWN', 'Moneda no disponible', false);

  private constructor(
    readonly wire: string,
    readonly label: string,
    readonly canCheckout: boolean,
  ) {}

  static fromWire(value: unknown): CartCurrency {
    return value === CartCurrency.Ars.wire ? CartCurrency.Ars : CartCurrency.Unknown;
  }
}
