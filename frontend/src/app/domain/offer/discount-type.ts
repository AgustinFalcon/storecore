/**
 * Closed storefront discount kinds. The amount stays operator text; this type only labels the kind.
 */
export class DiscountType {
  private constructor(
    readonly wire: string,
    readonly label: string,
  ) {}

  static readonly Percent = new DiscountType('PERCENT', 'Porcentaje');
  static readonly Fixed = new DiscountType('FIXED', 'Monto fijo');
  static readonly Unknown = new DiscountType('', 'Tipo de descuento no reconocido');

  static fromWire(raw: string | null | undefined): DiscountType {
    const wire = raw?.trim() ?? '';
    if (!wire) {
      return DiscountType.Unknown;
    }
    return BY_WIRE.get(wire) ?? DiscountType.Unknown;
  }

  static options(): readonly DiscountType[] {
    return KNOWN;
  }

  format(amount: string): string {
    const value = amount.trim();
    if (!value) {
      return this.label;
    }
    if (this === DiscountType.Percent) {
      return `${value} %`;
    }
    if (this === DiscountType.Fixed) {
      return `fijo ${value}`;
    }
    return this.label;
  }
}

const KNOWN: readonly DiscountType[] = [DiscountType.Percent, DiscountType.Fixed];

const BY_WIRE = new Map(KNOWN.map((type) => [type.wire, type]));
