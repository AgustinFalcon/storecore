import { MilestonePaint } from '../order/order-milestone';
import { ShippingChoice } from '../order/closed-status';

export class ShippingSimStatus {
  private constructor(
    readonly code: string,
    readonly label: string,
  ) {}

  static readonly Confirmed = new ShippingSimStatus('CONFIRMED', 'confirmado');
  static readonly Preparing = new ShippingSimStatus('PREPARING', 'en preparación');
  static readonly Packed = new ShippingSimStatus('PACKED', 'empaquetado');
  static readonly ReadyForPickup = new ShippingSimStatus('READY_FOR_PICKUP', 'listo para retirar');
  static readonly Dispatched = new ShippingSimStatus('DISPATCHED', 'despachado');
  static readonly Arriving = new ShippingSimStatus('ARRIVING', 'en camino');
  static readonly Unknown = new ShippingSimStatus('UNKNOWN', 'desconocido');
  static readonly known = [
    ShippingSimStatus.Confirmed,
    ShippingSimStatus.Preparing,
    ShippingSimStatus.Packed,
    ShippingSimStatus.ReadyForPickup,
    ShippingSimStatus.Dispatched,
    ShippingSimStatus.Arriving,
  ] as const;

  static fromWire(raw: unknown): ShippingSimStatus {
    const code = typeof raw === 'string' ? raw : null;
    return ShippingSimStatus.known.find((status) => status.code === code) ?? ShippingSimStatus.Unknown;
  }
}

export interface ShippingOption {
  readonly id: ShippingChoice;
  readonly name: string;
  readonly price: number;
  readonly windowLabel: string;
}

export interface ShippingSelection {
  readonly optionId: ShippingChoice | null;
  readonly status: ShippingSimStatus;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly originLatitude: number | null;
  readonly originLongitude: number | null;
}

export interface ShippingStep {
  readonly id: ShippingSimStatus;
  readonly label: string;
  readonly detail: string;
  readonly state: MilestonePaint;
}
