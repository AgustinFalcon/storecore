import { InventoryState } from '../catalog/catalog-states';
import { ChannelAvailability, ChannelFactReason, ChannelObservation, CreateManualPromo, ListingStatus, PolicyStatus } from './channel-pricing';
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

export interface ManualPromo extends CreateManualPromo {
  readonly id: string;
  readonly basePrice: number;
  readonly observedPrice: ChannelObservation;
  readonly status: PolicyStatus;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
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
  readonly accountRef: string | null;
  readonly status: MercadoLibreAccountStatus;
  readonly availability: ChannelAvailability;
  readonly reason: ChannelFactReason | null;
  readonly updatedAt: string | null;
}

export interface MercadoLibreMapping {
  readonly listingId: string;
  readonly variationId: string;
  readonly sku: string;
}

export interface MercadoLibreListing extends MercadoLibreMapping {
  readonly accountRef: string;
  readonly status: ListingStatus;
  readonly desiredQuantity: number;
  readonly desiredPrice: number | null;
  readonly observedQuantity: ChannelObservation;
  readonly observedPrice: ChannelObservation;
  readonly manualInterventionRequired: boolean;
  readonly updatedAt: string | null;
}
