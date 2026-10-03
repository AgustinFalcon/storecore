import { UserRole } from './user-role';

export interface UserSessionResult {
  readonly id: string;
  readonly roles: readonly UserRole[];
}

export interface UserCredentials {
  readonly email: string;
  readonly password: string;
}

export interface HomeContentDraft {
  readonly title: string;
  readonly body: string;
}

export interface ManualPromo {
  readonly id: string;
  readonly listingSku: string;
  readonly currency: string;
  readonly validFrom: string;
  readonly validTo: string;
  readonly priority: number;
  readonly margin: number;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly writer: 'MANUAL';
}

export interface ProfilePreview {
  readonly compatible: boolean;
  readonly version: string;
  readonly diff: string;
}

export type CapabilityState = 'DISABLED' | 'READ_ONLY' | 'ACTIVE' | 'PAUSED' | 'ERROR';

export interface CapabilityModule {
  readonly module: string;
  readonly state: CapabilityState;
}

export interface InventoryRow {
  readonly sku: string;
  readonly availableQuantity: number;
  readonly reservedQuantity: number;
  readonly safetyStock: number;
}

export interface MercadoLibreAccount {
  readonly authorized: boolean;
  readonly accountRef: string;
  readonly status: string;
}

export interface MercadoLibreListing {
  readonly listingId: string;
  readonly variationId: string;
  readonly sku: string;
}
