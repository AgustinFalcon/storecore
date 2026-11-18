import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { AccessContext } from '../../domain/access/access-context';
import { AccessMutationFence } from '../../core/auth/access-mutation-fence';
import { CustomerSession } from '../../core/auth/customer-session';
import { PurchaseIntentCoordinator, PurchaseIntentSnapshot } from '../../core/purchase-intent/purchase-intent-coordinator';
import { CartCurrency } from '../../domain/cart/cart-currency';
import { Cart } from '../../domain/cart/cart.entity';
import { CartLineMutationOutcome } from '../../domain/cart/cart-line-mutation-outcome';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import { ProductDetail } from '../../domain/catalog/product-detail.entity';
import { CartLineConfirmationResult, PurchaseIntent, PurchaseIntentResolutionResult, PurchaseIntentStage, RestoredPurchaseAvailability } from '../../domain/purchase-intent/purchase-intent';
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
  let reconcile: ReturnType<typeof vi.fn>;

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
      suspendForSelectionChange: vi.fn(),
      markAccepted: vi.fn(() => PurchaseIntentResolutionResult.Applied), markRejected: vi.fn(() => PurchaseIntentResolutionResult.Applied),
      markUnknown: vi.fn(() => PurchaseIntentResolutionResult.Applied), cancel: vi.fn(),
    };
    catalog = { product$, loading$: productLoading$, errorMessage$: productError$,
      viewState$: new BehaviorSubject({ product: product('B'), loading: false, errorMessage: '' }), snapshot: { product: product('B') }, loadProduct: vi.fn() };
    cartStore = { cart$, loading$: cartLoading$, errorMessage$: cartError$,
      viewState$: new BehaviorSubject({ cart, loading: false, errorMessage: '' }), snapshot: { cart }, authority: () => CustomerCartAccess.Ready,
      add: vi.fn(), load: vi.fn(), selectCustomer: vi.fn() };
    navigate = vi.fn(() => Promise.resolve(true));
    reconcile = vi.fn(() => of({}));
    TestBed.overrideComponent(ProductPageComponent, { set: { template: '', providers: [
      { provide: CatalogStore, useValue: catalog }, { provide: CustomerFavoritesStore, useValue: { load: vi.fn(), isFavorite: vi.fn(), selectSku: vi.fn(), add: vi.fn(), remove: vi.fn() } },
    ] } });
    await TestBed.configureTestingModule({ imports: [ProductPageComponent], providers: [
      { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({ sku: 'B' })), queryParamMap: query, snapshot: { paramMap: convertToParamMap({ sku: 'B' }) } } },
      { provide: Router, useValue: { navigate } }, { provide: CartStore, useValue: cartStore },
      { provide: PurchaseIntentCoordinator, useValue: intent },
      { provide: CustomerSession, useValue: { actorChanges$: new BehaviorSubject('customer'), actorIdentity: () => 'customer' } },
      { provide: AccessMutationFence, useValue: { snapshot: () => 1 } },
      { provide: AccessCoordinator, useValue: { stateChanges$: new BehaviorSubject(null), reconcileRegisteredCustomer: reconcile } },
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

  it('retires resume authority before exposing a different option', () => {
    const flow = PurchaseIntent.capture('opaque-flow-id-001', 'B', 'B-1', 2, 1);
    intentState.set({ ...emptySnapshot(flow, PurchaseIntentStage.ReadyForConfirmation), availability: RestoredPurchaseAvailability.Ready });
    query.next(convertToParamMap({ resume: flow.flowId }));
    (intent['suspendForSelectionChange'] as ReturnType<typeof vi.fn>).mockReturnValue(emptySnapshot(PurchaseIntent.Unknown, PurchaseIntentStage.Completed, 'cerrada'));
    const fixture = TestBed.createComponent(ProductPageComponent); fixture.detectChanges();
    const apply = vi.fn();
    globalThis.history.replaceState({}, '', `/catalog/B?resume=${flow.flowId}`);
    navigate.mockImplementation(() => new Promise<boolean>(() => undefined));
    fixture.componentInstance.authorizeSelectionChange({ apply });
    expect(intent['suspendForSelectionChange']).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { resume: null }, replaceUrl: true }));
    expect(fixture.componentInstance.intentMessage).toBe('cerrada');
    expect(apply).toHaveBeenCalledOnce();
    expect(globalThis.location.search).not.toContain('resume');
  });

  it('blocks the local option change when durable retirement or synchronous URL replacement fails', () => {
    const flow = PurchaseIntent.capture('opaque-flow-id-001', 'B', 'B-1', 2, 1);
    intentState.set(emptySnapshot(flow, PurchaseIntentStage.Restoring));
    query.next(convertToParamMap({ resume: flow.flowId }));
    (intent['suspendForSelectionChange'] as ReturnType<typeof vi.fn>).mockReturnValue({ ...emptySnapshot(PurchaseIntent.Unknown, PurchaseIntentStage.Unavailable, 'bloqueada'), storageResult: PurchaseIntentStorageResult.Unavailable });
    const fixture = TestBed.createComponent(ProductPageComponent); fixture.detectChanges();
    const apply = vi.fn();
    fixture.componentInstance.authorizeSelectionChange({ apply });
    expect(apply).not.toHaveBeenCalled();
    expect(fixture.componentInstance.selectionBlocked).toBe(true);

    (intent['suspendForSelectionChange'] as ReturnType<typeof vi.fn>).mockReturnValue(emptySnapshot(PurchaseIntent.Unknown, PurchaseIntentStage.Completed, 'cerrada'));
    query.next(convertToParamMap({ resume: flow.flowId }));
    const replace = vi.spyOn(globalThis.history, 'replaceState').mockImplementation(() => { throw new Error('history denied'); });
    fixture.componentInstance.selectionBlocked = false;
    fixture.componentInstance.authorizeSelectionChange({ apply });
    expect(apply).not.toHaveBeenCalled();
    expect(fixture.componentInstance.selectionBlocked).toBe(true);
    replace.mockRestore();
  });

  it('ignores every visible side effect from a stale cart callback', () => {
    const flow = PurchaseIntent.capture('opaque-flow-id-001', 'B', 'B-1', 2, 1);
    const claim = { flowId: flow.flowId, generation: 1, revision: 0, actor: { identity: 'customer', revision: 1, canMutate: true } };
    intentState.set({ ...emptySnapshot(flow, PurchaseIntentStage.ReadyForConfirmation), availability: RestoredPurchaseAvailability.Ready });
    query.next(convertToParamMap({ resume: flow.flowId }));
    (intent['beginConfirmation'] as ReturnType<typeof vi.fn>).mockReturnValue(claim);
    (intent['markAccepted'] as ReturnType<typeof vi.fn>).mockReturnValue(PurchaseIntentResolutionResult.Stale);
    const fixture = TestBed.createComponent(ProductPageComponent); fixture.detectChanges();
    navigate.mockClear();
    (cartStore['load'] as ReturnType<typeof vi.fn>).mockClear();
    (fixture.componentInstance as unknown as { awaitingProductRead: boolean; awaitingCartRead: boolean }).awaitingProductRead = false;
    (fixture.componentInstance as unknown as { awaitingProductRead: boolean; awaitingCartRead: boolean }).awaitingCartRead = false;
    fixture.componentInstance.addToCart({ sku: 'B-1', quantity: 2 });
    const command = (cartStore['add'] as ReturnType<typeof vi.fn>).mock.calls[0][0];
    command.report(CartLineMutationOutcome.Accepted);
    expect(navigate).not.toHaveBeenCalled();
    expect(cartStore['load']).not.toHaveBeenCalled();
  });

  it('fences a delayed reconciliation after another flow becomes current', () => {
    const old = PurchaseIntent.capture('opaque-flow-id-001', 'B', 'B-1', 2, 1);
    const claim = { flowId: old.flowId, generation: 1, revision: 0, actor: { identity: 'customer', revision: 1, canMutate: true } };
    intentState.set({ ...emptySnapshot(old, PurchaseIntentStage.ReadyForConfirmation), availability: RestoredPurchaseAvailability.Ready });
    query.next(convertToParamMap({ resume: old.flowId }));
    (intent['beginConfirmation'] as ReturnType<typeof vi.fn>).mockReturnValue(claim);
    const delayed = new Subject<{ activeContext: AccessContext; permits: (context: AccessContext) => boolean }>();
    reconcile.mockReturnValue(delayed);
    const fixture = TestBed.createComponent(ProductPageComponent); fixture.detectChanges();
    (fixture.componentInstance as unknown as { awaitingProductRead: boolean; awaitingCartRead: boolean }).awaitingProductRead = false;
    (fixture.componentInstance as unknown as { awaitingProductRead: boolean; awaitingCartRead: boolean }).awaitingCartRead = false;
    (cartStore['load'] as ReturnType<typeof vi.fn>).mockClear();
    (intent['invalidateAuthority'] as ReturnType<typeof vi.fn>).mockClear();
    fixture.componentInstance.addToCart({ sku: 'B-1', quantity: 2 });
    const command = (cartStore['add'] as ReturnType<typeof vi.fn>).mock.calls[0][0];
    command.report(CartLineMutationOutcome.OutcomeUnknown);
    const current = PurchaseIntent.capture('opaque-flow-id-002', 'B', 'B-2', 1, 2);
    intentState.set(emptySnapshot(current, PurchaseIntentStage.Restoring));
    query.next(convertToParamMap({ resume: current.flowId }));
    delayed.next({ activeContext: AccessContext.Customer, permits: () => true });
    expect(cartStore['load']).not.toHaveBeenCalled();
    expect(intent['invalidateAuthority']).not.toHaveBeenCalled();
  });
});
