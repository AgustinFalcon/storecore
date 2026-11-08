import { InventoryState } from '../catalog/catalog-states';
import { UserRole } from './user-role';
import { InventoryAvailability } from './inventory-availability';
import { MercadoLibreAccountStatus } from './mercadolibre-account-status';
import { CapabilityModuleId } from './capability-module-id';
import { CapabilityModuleState } from './capability-module-state';

export interface UserSessionResult {
  readonly id: string;
  readonly roles: readonly UserRole[];
}

export interface UserCredentials {
  readonly email: string;
  readonly password: string;
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

export interface CapabilityModule {
  readonly id: CapabilityModuleId;
  readonly state: CapabilityModuleState;
  readonly configVersion: number | null;
}

export interface InventoryRow {
  readonly variantId: string;
  readonly productName: string;
  readonly variantLabel: string;
  readonly onHand: number | null;
  readonly saleable: number | null;
  readonly updatedAt: string | null;
  readonly state: InventoryState;
  readonly sku: string;
  readonly availableQuantity: number | null;
  readonly reservedQuantity: number | null;
  readonly safetyStock: number | null;
  readonly availability: InventoryAvailability;
}

export interface MercadoLibreAccount {
  readonly authorized: boolean;
  readonly accountRef: string;
  readonly status: MercadoLibreAccountStatus;
}

export interface MercadoLibreListing {
  readonly listingId: string;
  readonly variationId: string;
  readonly sku: string;
}
