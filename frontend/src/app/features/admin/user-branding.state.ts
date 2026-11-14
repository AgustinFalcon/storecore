import { BrandingDraft, BrandingPhase, MerchantBranding } from '../../domain/branding/merchant-branding';
export interface UserBrandingState {
  readonly draft: BrandingDraft;
  readonly dirty: boolean;
  readonly published: MerchantBranding | null;
  readonly phase: BrandingPhase;
  readonly conflict: boolean;
  readonly error: string;
}
