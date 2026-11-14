import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { AccessMutationFence } from '../../core/auth/access-mutation-fence';
import { CustomerSession } from '../../core/auth/customer-session';
import { PurchaseIntentCoordinator, PurchaseIntentSnapshot } from '../../core/purchase-intent/purchase-intent-coordinator';
import { mapProductDetail } from '../../data/mappers/http-mappers';
import { CartCurrency } from '../../domain/cart/cart-currency';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import { CartLineConfirmationResult, PurchaseIntent, PurchaseIntentStage, RestoredPurchaseAvailability } from '../../domain/purchase-intent/purchase-intent';
import { PurchaseIntentStorageResult } from '../../domain/purchase-intent/purchase-intent-storage.port';
import { CartStore } from '../cart/cart.store';
import { CustomerFavoritesStore } from '../identity/customer-favorites.store';
import { CatalogStore } from './catalog.store';
import { ProductPageComponent } from './product-page.component';
import { ProductPageViewComponent } from './product-page.view';

describe('ProductPage restored quantity integration', () => {
  it('keeps the parent selection stable between the 1 and 2 keystrokes', async () => {
    const product = mapProductDetail({ id: 'p', sku: 'PRODUCT', name: 'Producto', status: 'ACTIVE', images: [],
      productBasePrice: 1, price: { base: 1, effective: 1, original: 1, offer: null }, variants: [{ pricePolicy: { mode: 'INHERITED', base: null }, price: { state: 'KNOWN', price: { base: 1, original: 1, effective: 1, offer: null } }, id: 'v', sku: 'VARIANT', name: 'Variante', status: 'ACTIVE', availability: 'AVAILABLE',
        attributes: {}, inventory: { variantId: 'v', sku: 'VARIANT', state: 'KNOWN', available: 20, reserved: 0, onHand: 20, safety: 0, saleable: 20 } }] });
    const cart = { revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', lines: [], currency: CartCurrency.Ars };
    const flow = PurchaseIntent.capture('opaque-flow-id-001', 'PRODUCT', 'VARIANT', 2, 1);
    const snapshot: PurchaseIntentSnapshot = { intent: flow, stage: PurchaseIntentStage.ReadyForConfirmation,
      availability: RestoredPurchaseAvailability.Ready, confirmation: CartLineConfirmationResult.Idle, revision: 0,
      currentQuantity: 0, storageResult: PurchaseIntentStorageResult.Saved, message: PurchaseIntentStage.ReadyForConfirmation.label };
    const intentState = signal(snapshot);
    const catalog = { product$: of(product), loading$: of(false), errorMessage$: of(''), snapshot: { product },
      viewState$: of({ product, loading: false, errorMessage: '' }), loadProduct: vi.fn() };
    const cartStore = { cart$: of(cart), loading$: of(false), errorMessage$: of(''), snapshot: { cart },
      viewState$: of({ cart, loading: false, errorMessage: '' }), authority: () => CustomerCartAccess.Ready, load: vi.fn(), add: vi.fn() };
    const intents = { snapshot: intentState.asReadonly(), validatedResumeReference: () => flow.flowId, invalidateAuthority: vi.fn(),
      resumeSelection: vi.fn(), revise: vi.fn(() => snapshot), beginConfirmation: vi.fn(), markAccepted: vi.fn(),
      markRejected: vi.fn(), markUnknown: vi.fn(), cancel: vi.fn() };
    TestBed.overrideComponent(ProductPageComponent, { set: { providers: [
      { provide: CatalogStore, useValue: catalog }, { provide: CustomerFavoritesStore, useValue: { isFavorite: () => false,
        viewState$: of({ mutationSku: '' }), errorMessage$: of(''), feedback$: of(''), load: vi.fn(), add: vi.fn(), remove: vi.fn() } },
    ] } });
    await TestBed.configureTestingModule({ imports: [ProductPageComponent], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({ sku: 'PRODUCT' })),
        queryParamMap: new BehaviorSubject(convertToParamMap({ resume: flow.flowId })), snapshot: { paramMap: convertToParamMap({ sku: 'PRODUCT' }) } } },
      { provide: CartStore, useValue: cartStore }, { provide: PurchaseIntentCoordinator, useValue: intents },
      { provide: CustomerSession, useValue: { actorChanges$: new BehaviorSubject('customer'), actorIdentity: () => 'customer' } },
      { provide: AccessMutationFence, useValue: { snapshot: () => 1 } },
      { provide: AccessCoordinator, useValue: { stateChanges$: new BehaviorSubject(null), reconcileRegisteredCustomer: () => of({}) } },
    ] }).compileComponents();
    const fixture = TestBed.createComponent(ProductPageComponent); fixture.detectChanges(); await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('input[name=quantity]') as HTMLInputElement;
    const child = fixture.debugElement.query((node) => node.componentInstance instanceof ProductPageViewComponent).componentInstance as ProductPageViewComponent;
    input.focus(); input.value = '1'; input.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    input.value = '12'; input.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges(); await fixture.whenStable();
    expect(child.quantity).toBe(12);
    expect(document.activeElement).toBe(input);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(intents.revise).toHaveBeenCalledExactlyOnceWith('VARIANT', 12);
  });
});
