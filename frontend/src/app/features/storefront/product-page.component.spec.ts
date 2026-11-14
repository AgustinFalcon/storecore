import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { AccessMutationFence } from '../../core/auth/access-mutation-fence';
import { CustomerSession } from '../../core/auth/customer-session';
import { PurchaseIntentCoordinator, PurchaseIntentSnapshot } from '../../core/purchase-intent/purchase-intent-coordinator';
import { CartCurrency } from '../../domain/cart/cart-currency';
import { Cart } from '../../domain/cart/cart.entity';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import { ProductDetail } from '../../domain/catalog/product-detail.entity';
import { CartLineConfirmationResult, PurchaseIntent, PurchaseIntentStage, RestoredPurchaseAvailability } from '../../domain/purchase-intent/purchase-intent';
import { PurchaseIntentStorageResult } from '../../domain/purchase-intent/purchase-intent-storage.port';
import { CartStore } from '../cart/cart.store';
import { CustomerFavoritesStore } from '../identity/customer-favorites.store';
import { CatalogStore } from './catalog.store';
import { ProductPageComponent } from './product-page.component';

const product = (sku: string) => ({ sku, variants: [] } as unknown as ProductDetail);
const cart: Cart = { revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', lines: [], currency: CartCurrency.Ars };
const emptySnapshot = (intent = PurchaseIntent.Unknown, stage = PurchaseIntentStage.Unknown, message = ''): PurchaseIntentSnapshot => ({
  intent, stage, availability: RestoredPurchaseAvailability.Unknown, confirmation: CartLineConfirmationResult.Idle,
  revision: 0, currentQuantity: 0, storageResult: PurchaseIntentStorageResult.Empty, message,
});

describe('ProductPage purchase-intent scope', () => {
  let product$: BehaviorSubject<ProductDetail | null>;
  let productLoading$: BehaviorSubject<boolean>;
  let productError$: BehaviorSubject<string>;
  let cart$: BehaviorSubject<Cart>;
  let cartLoading$: BehaviorSubject<boolean>;
  let cartError$: BehaviorSubject<string>;
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let intentState: ReturnType<typeof signal<PurchaseIntentSnapshot>>;
  let intent: Record<string, unknown>;
  let catalog: Record<string, unknown>;
  let cartStore: Record<string, unknown>;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    product$ = new BehaviorSubject<ProductDetail | null>(product('B'));
    productLoading$ = new BehaviorSubject(false);
    productError$ = new BehaviorSubject('');
    cart$ = new BehaviorSubject(cart);
    cartLoading$ = new BehaviorSubject(false);
    cartError$ = new BehaviorSubject('');
    query = new BehaviorSubject(convertToParamMap({}));
    intentState = signal(emptySnapshot());
    intent = {
      snapshot: intentState.asReadonly(), validatedResumeReference: vi.fn((raw: unknown) => typeof raw === 'string' ? raw : null),
      resumeSelection: vi.fn(), invalidateAuthority: vi.fn(), capture: vi.fn(), revise: vi.fn(), beginConfirmation: vi.fn(),
      markAccepted: vi.fn(), markRejected: vi.fn(), markUnknown: vi.fn(), cancel: vi.fn(),
    };
    catalog = { product$, loading$: productLoading$, errorMessage$: productError$,
      viewState$: new BehaviorSubject({ product: product('B'), loading: false, errorMessage: '' }), snapshot: { product: product('B') }, loadProduct: vi.fn() };
    cartStore = { cart$, loading$: cartLoading$, errorMessage$: cartError$,
      viewState$: new BehaviorSubject({ cart, loading: false, errorMessage: '' }), snapshot: { cart }, authority: () => CustomerCartAccess.Ready,
      add: vi.fn(), load: vi.fn(), selectCustomer: vi.fn() };
    navigate = vi.fn(() => Promise.resolve(true));
    TestBed.overrideComponent(ProductPageComponent, { set: { template: '', providers: [
      { provide: CatalogStore, useValue: catalog }, { provide: CustomerFavoritesStore, useValue: { load: vi.fn(), isFavorite: vi.fn(), add: vi.fn(), remove: vi.fn() } },
    ] } });
    await TestBed.configureTestingModule({ imports: [ProductPageComponent], providers: [
      { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({ sku: 'B' })), queryParamMap: query, snapshot: { paramMap: convertToParamMap({ sku: 'B' }) } } },
      { provide: Router, useValue: { navigate } }, { provide: CartStore, useValue: cartStore },
      { provide: PurchaseIntentCoordinator, useValue: intent },
      { provide: CustomerSession, useValue: { actorChanges$: new BehaviorSubject('customer'), actorIdentity: () => 'customer' } },
      { provide: AccessMutationFence, useValue: { snapshot: () => 1 } },
      { provide: AccessCoordinator, useValue: { stateChanges$: new BehaviorSubject(null), reconcileRegisteredCustomer: () => of({}) } },
    ] }).compileComponents();
  });

  it('does not let a root intent for product A govern ordinary product B', () => {
    const flow = PurchaseIntent.capture('opaque-flow-id-001', 'A', 'A-1', 2, 1);
    intentState.set(emptySnapshot(flow, PurchaseIntentStage.ReadyForConfirmation));
    query.next(convertToParamMap({ resume: flow.flowId }));
    const fixture = TestBed.createComponent(ProductPageComponent); fixture.detectChanges();
    fixture.componentInstance.addToCart({ sku: 'B-1', quantity: 1 });
    expect(cartStore['add']).toHaveBeenCalledWith({ sku: 'B-1', quantity: 1 });
    expect(fixture.componentInstance.restoredSelection).toBeNull();
  });

  it('does not let completed intent state block a later ordinary purchase', () => {
    const flow = PurchaseIntent.capture('opaque-flow-id-001', 'B', 'B-1', 2, 1);
    intentState.set(emptySnapshot(flow, PurchaseIntentStage.Completed, 'Completado'));
    const fixture = TestBed.createComponent(ProductPageComponent); fixture.detectChanges();
    fixture.componentInstance.addToCart({ sku: 'B-1', quantity: 1 });
    expect(cartStore['add']).toHaveBeenCalledWith({ sku: 'B-1', quantity: 1 });
  });

  it('shows capture storage failure instead of leaving a dead CTA', () => {
    (intent['capture'] as ReturnType<typeof vi.fn>).mockReturnValue(emptySnapshot(PurchaseIntent.Unknown, PurchaseIntentStage.Unknown, 'Storage no disponible'));
    const fixture = TestBed.createComponent(ProductPageComponent); fixture.detectChanges();
    fixture.componentInstance.beginAccess({ sku: 'B-1', quantity: 1 });
    expect(fixture.componentInstance.intentMessage).toBe('Storage no disponible');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('requires successful fresh reads and refetches after a correction', () => {
    const flow = PurchaseIntent.capture('opaque-flow-id-001', 'B', 'B-1', 2, 1);
    intentState.set(emptySnapshot(flow, PurchaseIntentStage.Restoring));
    query.next(convertToParamMap({ resume: flow.flowId }));
    (catalog['viewState$'] as BehaviorSubject<{ product: ProductDetail | null; loading: boolean; errorMessage: string }>).next({ product: product('B'), loading: false, errorMessage: 'read failed' });
    const fixture = TestBed.createComponent(ProductPageComponent); fixture.detectChanges();
    expect(intent['resumeSelection']).not.toHaveBeenCalled();
    (intent['revise'] as ReturnType<typeof vi.fn>).mockReturnValue(emptySnapshot(flow, PurchaseIntentStage.Restoring));
    fixture.componentInstance.reviseIntent({ sku: 'B-2', quantity: 1 });
    expect(catalog['loadProduct']).toHaveBeenCalledWith('B');
    expect(cartStore['load']).toHaveBeenCalled();
    expect(intent['resumeSelection']).not.toHaveBeenCalled();
  });
});
