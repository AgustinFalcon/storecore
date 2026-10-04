import { CapabilityModuleId } from './capability-module-id';
import { CapabilityModuleState } from './capability-module-state';

export interface UserSessionResult {
  readonly id: string;
  readonly roles: readonly string[];
}

export interface UserCredentials {
  readonly email: string;
  readonly password: string;
}

export interface HomeBannerBlock {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

export interface HomeContentDraft {
  readonly title: string;
  readonly body: string;
  readonly blocks?: readonly HomeBannerBlock[];
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
  readonly module: CapabilityModuleId;
  readonly state: CapabilityModuleState;
  readonly configVersion: number | null;
}

export interface CapabilityChange {
  readonly module: CapabilityModuleId;
  readonly state: CapabilityModuleState;
}

export interface CapabilityStateCommand extends CapabilityChange {
  readonly correlationId: string;
  readonly expectedConfigVersion: number;
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
  readonly accountId: number | null;
}
