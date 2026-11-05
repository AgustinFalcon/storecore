import { DemoContext, DemoProduct, DemoProductVariant } from '../demo-model';
import { DemoScreen } from '../demo-screen';
import { UserRole } from '../../domain/user/user-role';
import { CatalogQueryReader, DemoCatalogLocation } from '../catalog/demo-catalog-location';
import { DemoProductSelection } from '../catalog/demo-product-selection';
import { DemoReturnDestination, DemoReturnTarget } from './demo-return-destination';

export class PurchaseCaptureStatus {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Ready = new PurchaseCaptureStatus('ready', 'Selección conservada. Ingresá y revisá el producto antes de agregarlo.');
  static readonly Unavailable = new PurchaseCaptureStatus('unavailable', 'Este producto no está disponible para continuar la compra.');
  static readonly Variant = new PurchaseCaptureStatus('variant', 'Elegí una variante disponible antes de continuar.');
  static readonly Quantity = new PurchaseCaptureStatus('quantity', 'Elegí una cantidad entera disponible antes de continuar.');
  static readonly Unknown = new PurchaseCaptureStatus('', 'No pudimos conservar este destino. Volvé a elegir el producto.');
  static readonly all = [this.Ready, this.Unavailable, this.Variant, this.Quantity] as const;
  static fromWire(raw: unknown): PurchaseCaptureStatus { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}
export interface CapturedPurchase { readonly status: PurchaseCaptureStatus; readonly target: DemoReturnTarget; }
export class AccessSelectionPurpose {
  private constructor(readonly wire: string, readonly needsStock: boolean) {}
  static readonly Purchase = new AccessSelectionPurpose('purchase', true);
  static readonly Favorite = new AccessSelectionPurpose('favorite', false);
  static readonly Unknown = new AccessSelectionPurpose('', true);
  static readonly all = [this.Purchase, this.Favorite] as const;
  static fromWire(raw: unknown): AccessSelectionPurpose { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class CapturePurchaseStep {
  private readonly location = new DemoCatalogLocation();
  execute(product: DemoProduct | undefined, variant: DemoProductVariant, quantity: number, available: number, catalog: CatalogQueryReader, purpose = AccessSelectionPurpose.Purchase,variants:readonly DemoProductVariant[]=product?.supportsCase===true?DemoProductVariant.all:[DemoProductVariant.Standard]): CapturedPurchase {
    const invalid = (status: PurchaseCaptureStatus): CapturedPurchase => ({ status, target: DemoReturnDestination.fromWire(null) });
    if (purpose === AccessSelectionPurpose.Unknown) return invalid(PurchaseCaptureStatus.Unknown);
    if (!product?.active || (purpose.needsStock && available <= 0)) return invalid(PurchaseCaptureStatus.Unavailable);
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(this.location.toQuery(this.location.fromQuery(catalog)))) if (value !== null) query.set(key, String(value));
    query.set('variant', variant.wire); query.set('quantity', String(quantity));
    const selected = DemoProductSelection.fromWire(query, variants, available);
    if (selected.variant === DemoProductVariant.Unknown) return invalid(PurchaseCaptureStatus.Variant);
    if (!Number.isSafeInteger(selected.quantity)) {
      if (purpose !== AccessSelectionPurpose.Favorite) return invalid(PurchaseCaptureStatus.Quantity);
      // Favorites do not require a purchasable quantity. Omission restores the
      // default selection on return; adding still needs explicit validation.
      query.delete('quantity');
    }
    const target = DemoReturnDestination.fromWire('/demo/catalog/'+encodeURIComponent(product.sku)+'?'+query.toString());
    return { status: target.kind === DemoReturnDestination.Product ? PurchaseCaptureStatus.Ready : PurchaseCaptureStatus.Unknown, target };
  }
}

export class ResolveAccessStep {
  execute(raw: unknown, entry: DemoScreen, context: DemoContext, role: UserRole): string | null {
    if (entry !== DemoScreen.Login && entry !== DemoScreen.Register) return null;
    if (context === DemoContext.Admin) return role === UserRole.Admin ? '/demo/'+DemoScreen.AdminHome.path : role === UserRole.Operator ? '/demo/'+DemoScreen.Customers.path : null;
    if (context !== DemoContext.Customer) return null;
    const target = DemoReturnDestination.fromWire(raw);
    return target.kind !== DemoReturnDestination.Unknown ? target.url : entry === DemoScreen.Register ? '/demo/'+DemoScreen.Profile.path : '/demo';
  }
}

export class CompleteAccessStep {
  execute(destination: string | null, authenticate: () => boolean): string | null { return destination !== null && authenticate() ? destination : null; }
}

/** Orders pure access steps; no pending action, browser storage or account writes. */
export class DemoAccessContinuation {
  readonly capture = new CapturePurchaseStep();
  readonly resolve = new ResolveAccessStep();
  readonly complete = new CompleteAccessStep();
  query(raw: unknown): { returnUrl: string } | null {
    const target = DemoReturnDestination.fromWire(raw);
    return target.kind === DemoReturnDestination.Unknown ? null : { returnUrl: target.url };
  }
  route(raw: unknown): { returnUrl: string } | null { return this.query(raw); }
}
