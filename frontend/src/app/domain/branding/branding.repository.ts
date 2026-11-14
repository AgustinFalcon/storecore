import { Observable, throwError } from 'rxjs';
import { BrandingDraft, MerchantBranding } from './merchant-branding';
export interface ReplaceBranding extends BrandingDraft { readonly expectedRevision: number; }
export interface IBrandingRepository {
  readPublic(): Observable<MerchantBranding | null>;
  readAdmin(): Observable<MerchantBranding>;
  replace(command: ReplaceBranding): Observable<MerchantBranding>;
}
export class ReadStoreBrandingUseCase {
  constructor(private readonly repository: IBrandingRepository) {}
  execute(): Observable<MerchantBranding | null> { return this.repository.readPublic(); }
}
export class ManageBrandingUseCase {
  constructor(private readonly repository: IBrandingRepository) {}
  load(): Observable<MerchantBranding> { return this.repository.readAdmin(); }
  execute(draft: BrandingDraft, revision: number): Observable<MerchantBranding> {
    const value = MerchantBranding.validateDraft(draft, revision);
    if (!value) return throwError(() => new Error('Revisá el nombre, el logo y el contraste mínimo de 4,5:1.'));
    return this.repository.replace({ ...value.draft(), expectedRevision: revision });
  }
}
