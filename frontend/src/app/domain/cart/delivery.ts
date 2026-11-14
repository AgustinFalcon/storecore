import { CartCurrency } from './cart-currency';
import { isArsAmount } from '../catalog/variant-price';

export class DeliveryMode {
  private constructor(readonly wire: string, readonly label: string, readonly requiresAddress: boolean, readonly known: boolean) {}
  static readonly Pickup = new DeliveryMode('PICKUP', 'Retiro en local', false, true);
  static readonly LocalDelivery = new DeliveryMode('LOCAL_DELIVERY', 'Entrega local', true, true);
  static readonly Unknown = new DeliveryMode('UNKNOWN', 'Modalidad no disponible', false, false);
  static fromWire(raw: unknown): DeliveryMode {
    return [this.Pickup, this.LocalDelivery].find(value => value.wire === raw) ?? this.Unknown;
  }
}
function record(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}
function text(raw: unknown): raw is string { return typeof raw === 'string' && !!raw.trim(); }
export class DeliveryQuote {
  private constructor(readonly mode: DeliveryMode, readonly label: string, readonly cost: number | null,
    readonly currency: CartCurrency, readonly minDays: number, readonly maxDays: number,
    readonly configurationVersion: number, readonly destination: string | null, readonly instructions: string | null) {}
  static readonly Unknown = new DeliveryQuote(DeliveryMode.Unknown, 'Entrega no disponible', null, CartCurrency.Unknown, 0, 0, 0, null, null);
  get known(): boolean { return this.mode.known && this.cost !== null; }
  get requiresAddress(): boolean { return this.mode.requiresAddress; }
  get isPickup(): boolean { return this.mode === DeliveryMode.Pickup; }
  get eta(): string { return this.known ? `${this.minDays} a ${this.maxDays} días desde la acreditación del pago` : 'Plazo no disponible'; }
  same(other: DeliveryQuote): boolean {
    return this.known && other.known && JSON.stringify(this) === JSON.stringify(other);
  }
  static fromWire(raw: unknown, snapshot = false): DeliveryQuote {
    const row = record(raw), mode = DeliveryMode.fromWire(row['mode']);
    const currency = CartCurrency.fromWire(row['currency']);
    const min = row['minDays'], max = row['maxDays'], version = row['configurationVersion'];
    if (!mode.known || !text(row['label']) || !isArsAmount(row['cost']) || !currency.canCheckout
      || row['requiresAddress'] !== mode.requiresAddress || typeof min !== 'number' || !Number.isSafeInteger(min) || min < 0
      || typeof max !== 'number' || !Number.isSafeInteger(max) || max < min
      || typeof version !== 'number' || !Number.isSafeInteger(version) || version <= 0) return this.Unknown;
    let destination: string | null = null;
    if (mode === DeliveryMode.Pickup) {
      if (!text(row['destination']) || !text(row['instructions'])) return this.Unknown;
      destination = row['destination'];
    } else if (snapshot) {
      const address = record(row['destination']);
      if (!['street', 'number', 'city', 'province', 'postalCode'].every(key => text(address[key]))) return this.Unknown;
      destination = `${address['street']} ${address['number']}, ${address['city']}, ${address['province']} · ${address['postalCode']}`;
    } else if (row['destination'] != null || row['instructions'] != null) return this.Unknown;
    if (row['instructions'] != null && !text(row['instructions'])) return this.Unknown;
    return new DeliveryQuote(mode, row['label'], row['cost'], currency, min, max, version, destination, row['instructions'] as string | null ?? null);
  }
  static listFromWire(raw: unknown): readonly DeliveryQuote[] {
    if (!Array.isArray(raw) || raw.length > 2) return [];
    const quotes = raw.map(value => this.fromWire(value));
    return quotes.some(value => !value.known) || new Set(quotes.map(value => value.mode)).size !== quotes.length ? [] : quotes;
  }
}
export class DeliverySnapshotState {
  private constructor(readonly wire: string, readonly label: string, readonly permitsLegacy: boolean) {}
  static readonly Known = new DeliverySnapshotState('KNOWN', 'Entrega acordada', false);
  static readonly LegacyMissingBlock = new DeliverySnapshotState('LEGACY_MISSING_BLOCK', 'Modalidad no registrada en este pedido histórico', true);
  static readonly Invalid = new DeliverySnapshotState('INVALID', 'Datos de entrega no disponibles', false);
  static readonly Unknown = this.Invalid;
  static fromWire(raw: unknown): DeliverySnapshotState {
    return [this.Known, this.LegacyMissingBlock].find(value => value.wire === raw) ?? this.Invalid;
  }
}
export class DeliveryDecision {
  private constructor(readonly state: DeliverySnapshotState, readonly quote: DeliveryQuote) {}
  static readonly Unknown = new DeliveryDecision(DeliverySnapshotState.Invalid, DeliveryQuote.Unknown);
  static fromWire(raw: unknown): DeliveryDecision {
    const row = record(raw), state = DeliverySnapshotState.fromWire(row['state']);
    if (state === DeliverySnapshotState.Known) {
      const quote = DeliveryQuote.fromWire(row['value'], true);
      return quote.known ? new DeliveryDecision(state, quote) : this.Unknown;
    }
    return state.permitsLegacy && row['value'] === null ? new DeliveryDecision(state, DeliveryQuote.Unknown) : this.Unknown;
  }
  get canFulfill(): boolean { return this.state === DeliverySnapshotState.Known || this.state.permitsLegacy; }
  get showsTracking(): boolean { return this.state.permitsLegacy || this.state === DeliverySnapshotState.Known && this.quote.requiresAddress; }
}

/** Decimal amounts are summed as safe minor units; Unknown never means free. */
export function checkoutTotal(lines: readonly {effectiveUnitPrice:number;quantity:number}[], quote: DeliveryQuote): number | null {
  if (!quote.known) return null;
  let minor = Math.round(quote.cost! * 100);
  for (const line of lines) {
    if (!isArsAmount(line.effectiveUnitPrice) || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) return null;
    minor += Math.round(line.effectiveUnitPrice * 100) * line.quantity;
    if (!Number.isSafeInteger(minor) || minor > 99999999999999) return null;
  }
  return minor / 100;
}
