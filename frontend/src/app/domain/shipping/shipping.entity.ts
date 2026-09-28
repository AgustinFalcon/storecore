export type ShippingOptionId = 'PICKUP' | 'STANDARD' | 'EXPRESS';

export type ShippingSimStatus =
  | 'CONFIRMED'
  | 'PREPARING'
  | 'PACKED'
  | 'READY_FOR_PICKUP'
  | 'DISPATCHED'
  | 'ARRIVING';

export interface ShippingOption {
  readonly id: ShippingOptionId;
  readonly name: string;
  readonly price: number;
  readonly windowLabel: string;
}

export interface ShippingSelection {
  readonly optionId: ShippingOptionId | null;
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
  readonly state: 'done' | 'current' | 'upcoming';
}
