import type { DemoAddress } from '../demo-model';
import { DemoDeliveryMethod, type DemoDeliverySnapshot } from '../demo-process-types';

/** Pure shared source for the visible offer and the persisted delivery facts. */
export class DemoDeliveryQuote {
  private constructor(readonly method: DemoDeliveryMethod, readonly addressId: string, readonly destination: string, readonly cost: number, readonly days: number) {}
  static readonly Unknown = new DemoDeliveryQuote(DemoDeliveryMethod.Unknown, '', '', NaN, 0);
  static create(method: DemoDeliveryMethod, address: DemoAddress | undefined, homeDays: number): DemoDeliveryQuote {
    if (method === DemoDeliveryMethod.Unknown) return this.Unknown;
    if (method === DemoDeliveryMethod.Pickup) return new DemoDeliveryQuote(method, '', 'Comercio de muestra · Retiro con DNI y número de pedido', method.cost, method.days);
    if (!address?.street.trim() || !address.city.trim() || !address.postal.trim() || !Number.isSafeInteger(homeDays) || homeDays < 1) return this.Unknown;
    return new DemoDeliveryQuote(method, address.id, `${address.street} · ${address.city} · CP ${address.postal}`, method.cost, homeDays);
  }
  get valid(): boolean { return this !== DemoDeliveryQuote.Unknown; }
  sameAs(other: DemoDeliveryQuote): boolean { return this.valid && other.valid && this.method === other.method && this.addressId === other.addressId && this.destination === other.destination && this.cost === other.cost && this.days === other.days; }
  snapshot(): DemoDeliverySnapshot {
    if (!this.valid) throw new Error('Seleccioná una entrega válida.');
    return { method: this.method, destination: this.destination, cost: this.cost, days: this.days };
  }
}

export class DeliveryConfirmation {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Pending = new DeliveryConfirmation('pending', 'Entrega pendiente de confirmación');
  static readonly Confirmed = new DeliveryConfirmation('confirmed', 'Entrega confirmada');
  static readonly Unknown = new DeliveryConfirmation('', 'Confirmación desconocida');
  static readonly all = [this.Pending, this.Confirmed] as const;
  static fromWire(raw: unknown): DeliveryConfirmation { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

/** Acceptance binds to exact visible delivery and cart facts, not a loose boolean. */
export class DemoDeliveryAcceptance {
  private quote = DemoDeliveryQuote.Unknown;
  private cart = '';
  state(quote: DemoDeliveryQuote, cart: string): DeliveryConfirmation { return this.quote.sameAs(quote) && this.cart === cart ? DeliveryConfirmation.Confirmed : DeliveryConfirmation.Pending; }
  confirm(quote: DemoDeliveryQuote, cart: string): void { this.quote = quote; this.cart = cart; }
  reset(): void { this.quote = DemoDeliveryQuote.Unknown; this.cart = ''; }
}
