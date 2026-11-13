import { CartCurrency } from '../../domain/cart/cart-currency';
import { Cart } from '../../domain/cart/cart.entity';
import { ProductStatus, VariantStatus } from '../../domain/catalog/catalog-states';
import { ProductDetail } from '../../domain/catalog/product-detail.entity';
import { CartLineConfirmationResult, PURCHASE_INTENT_TTL_MS, PurchaseIntent, PurchaseIntentStage, RestoredPurchaseAvailability } from '../../domain/purchase-intent/purchase-intent';
import { PurchaseIntentStorageResult } from '../../domain/purchase-intent/purchase-intent-storage.port';
import { SessionPurchaseIntentStorageAdapter } from '../../data/purchase-intent/session-purchase-intent-storage.adapter';
import { PurchaseIntentActor, PurchaseIntentClaim, PurchaseIntentCoordinator } from './purchase-intent-coordinator';

describe('PurchaseIntentCoordinator', () => {
  let coordinator: PurchaseIntentCoordinator;
  let now: number;
  let storage: SessionPurchaseIntentStorageAdapter;
  const actor: PurchaseIntentActor = { identity: 'customer-a', revision: 1, canMutate: true };
  const cart: Cart = { lines: [], currency: CartCurrency.fromWire('ARS') };
  const product = { sku: 'PRODUCT-1', active: true, status: ProductStatus.Active,
    variants: [{ sku: 'FIRST', status: VariantStatus.Active, availableQuantity: 10 }, { sku: 'VARIANT-2', status: VariantStatus.Active, availableQuantity: 5 }] } as unknown as ProductDetail;
  beforeEach(() => {
    now = 1000000;
    const values = new Map<string, string>();
    storage = new SessionPurchaseIntentStorageAdapter(() => ({ getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } }));
    let id = 0;
    coordinator = new PurchaseIntentCoordinator(storage, { now: () => now }, { next: () => `opaque-flow-id-${++id}` });
  });
  function ready(): PurchaseIntentClaim {
    const captured = coordinator.capture('PRODUCT-1', 'VARIANT-2', 2);
    const claim = coordinator.claim(captured.intent.flowId, actor)!;
    coordinator.restore(claim, product, cart);
    return claim;
  }
  it('captures exact variant and quantity and requires explicit confirmation', () => {
    ready();
    expect(coordinator.snapshot().intent.variantSku).toBe('VARIANT-2');
    expect(coordinator.snapshot().intent.quantity).toBe(2);
    expect(coordinator.snapshot().stage).toBe(PurchaseIntentStage.ReadyForConfirmation);
    expect(coordinator.snapshot().confirmation).toBe(CartLineConfirmationResult.Idle);
    expect(coordinator.beginConfirmation(actor)).not.toBeNull();
    expect(coordinator.beginConfirmation(actor)).toBeNull();
  });
  it('requires a valid matching opaque reference and accepted CUSTOMER', () => {
    const flow = coordinator.capture('PRODUCT-1', 'VARIANT-2', 2).intent.flowId;
    for (const raw of [null, '/catalog/a', '%6fpaque-flow-id-1', 'opaque-flow-id-other']) expect(coordinator.validatedResumeReference(raw)).toBeNull();
    expect(coordinator.continuationForCustomer(flow)).toEqual({ flowId: flow, productSku: 'PRODUCT-1' });
    expect(coordinator.claim(flow, { ...actor, canMutate: false })).toBeNull();
    expect(coordinator.claim(flow, { ...actor, identity: null })).toBeNull();
  });
  it('never falls back to another variant and rejects stale product/stock', () => {
    const claim = ready();
    coordinator.restore(claim, { ...product, variants: product.variants.slice(0, 1) }, cart);
    expect(coordinator.snapshot().availability).toBe(RestoredPurchaseAvailability.VariantUnavailable);
    coordinator.restore(claim, { ...product, active: false }, cart);
    expect(coordinator.snapshot().availability).toBe(RestoredPurchaseAvailability.ProductUnavailable);
    coordinator.restore(claim, { ...product, variants: [{ ...product.variants[1], availableQuantity: 1 }] }, cart);
    expect(coordinator.snapshot().availability).toBe(RestoredPurchaseAvailability.QuantityUnavailable);
    expect(coordinator.beginConfirmation(actor)).toBeNull();
  });
  it('invalidates old reads on explicit correction and preserves TTL', () => {
    const old = ready();
    const expiry = coordinator.snapshot().intent.expiresAt;
    coordinator.revise('FIRST', 3);
    coordinator.restore(old, product, cart);
    expect(coordinator.snapshot().stage).toBe(PurchaseIntentStage.Restoring);
    const claim = coordinator.claim(old.flowId, actor)!;
    coordinator.restore(claim, product, cart);
    expect(coordinator.snapshot().intent.variantSku).toBe('FIRST');
    expect(coordinator.snapshot().revision).toBe(1);
    expect(coordinator.snapshot().intent.expiresAt).toBe(expiry);
    expect(coordinator.beginConfirmation(actor)).toBe(claim);
  });
  it('expires at the final pre-send check and fences actor/revision changes', () => {
    ready();
    expect(coordinator.beginConfirmation({ ...actor, revision: 2 })).toBeNull();
    expect(coordinator.beginConfirmation({ ...actor, identity: 'customer-b' })).toBeNull();
    now += PURCHASE_INTENT_TTL_MS;
    expect(coordinator.beginConfirmation(actor)).toBeNull();
    expect(coordinator.snapshot().stage).toBe(PurchaseIntentStage.Expired);
  });
  it('acceptance stays terminal despite expiry, refresh failure or failed cleanup', () => {
    const claim = ready();
    coordinator.beginConfirmation(actor);
    now += PURCHASE_INTENT_TTL_MS;
    storage.clear = () => PurchaseIntentStorageResult.Unavailable;
    coordinator.markAccepted(claim);
    coordinator.restore(claim, null, cart);
    expect(coordinator.snapshot().stage).toBe(PurchaseIntentStage.Completed);
    expect(coordinator.snapshot().confirmation).toBe(CartLineConfirmationResult.Accepted);
    expect(coordinator.snapshot().storageResult).toBe(PurchaseIntentStorageResult.Unavailable);
    expect(coordinator.validatedResumeReference(claim.flowId)).toBeNull();
    expect(coordinator.beginConfirmation(actor)).toBeNull();
  });
  it('requires a fresh read and another explicit confirmation after an ambiguous result', () => {
    const claim = ready();
    coordinator.beginConfirmation(actor);
    coordinator.markUnknown(claim);
    expect(coordinator.snapshot().confirmation).toBe(CartLineConfirmationResult.OutcomeUnknown);
    expect(coordinator.beginConfirmation(actor)).toBeNull();
    const next = coordinator.claim(claim.flowId, actor)!;
    coordinator.restore(next, product, { ...cart, lines: [{ sku: 'VARIANT-2', quantity: 7 } as Cart['lines'][number]] });
    expect(coordinator.snapshot().currentQuantity).toBe(7);
    expect(coordinator.beginConfirmation(actor)).toBe(next);
  });
  it('resolves the server result before cancellation closes an in-flight mutation', () => {
    const claim = ready();
    coordinator.beginConfirmation(actor);
    coordinator.cancel();
    expect(coordinator.snapshot().confirmation).toBe(CartLineConfirmationResult.Pending);
    coordinator.markAccepted(claim);
    expect(coordinator.snapshot().confirmation).toBe(CartLineConfirmationResult.Accepted);
    expect(coordinator.snapshot().stage).toBe(PurchaseIntentStage.Completed);
  });
  it('fences stale restoration after logout and terminal flows after a fresh instance', () => {
    const claim = ready();
    coordinator.invalidateAuthority();
    coordinator.restore(claim, product, cart);
    expect(coordinator.beginConfirmation(actor)).toBeNull();
    coordinator.cancel();
    const fresh = new PurchaseIntentCoordinator(storage, { now: () => now }, { next: () => 'opaque-flow-id-new' });
    expect(fresh.validatedResumeReference(claim.flowId)).toBeNull();
  });
  it('preserves the unknown server outcome when cancellation was requested in flight', () => {
    const claim = ready();
    coordinator.beginConfirmation(actor);
    coordinator.cancel();
    coordinator.markUnknown(claim);
    expect(coordinator.snapshot().confirmation).toBe(CartLineConfirmationResult.OutcomeUnknown);
    expect(coordinator.snapshot().stage).toBe(PurchaseIntentStage.Completed);
    expect(coordinator.beginConfirmation(actor)).toBeNull();
  });
  it('blocks old restoration and confirmation during an unsaved correction', () => {
    const claim = ready();
    storage.save = () => PurchaseIntentStorageResult.Unavailable;
    coordinator.revise('FIRST', 3);
    expect(coordinator.claim(claim.flowId, actor)).toBeNull();
    expect(coordinator.snapshot().stage).toBe(PurchaseIntentStage.Unavailable);
    expect(coordinator.beginConfirmation(actor)).toBeNull();
  });
  it('does not edit, replace or accept an unrelated result while PUT is pending', () => {
    const claim = ready();
    coordinator.beginConfirmation(actor);
    coordinator.revise('FIRST', 4);
    coordinator.capture('NEW', 'NEW-VARIANT', 4);
    coordinator.markAccepted({ ...claim });
    expect(coordinator.snapshot().intent.variantSku).toBe('VARIANT-2');
    expect(coordinator.snapshot().confirmation).toBe(CartLineConfirmationResult.Pending);
    coordinator.markRejected(claim);
    expect(coordinator.snapshot().confirmation).toBe(CartLineConfirmationResult.Rejected);
    expect(coordinator.beginConfirmation(actor)).toBeNull();
  });
  it('does not claim persistence when saving is unavailable', () => {
    storage.save = () => PurchaseIntentStorageResult.Unavailable;
    expect(coordinator.capture('PRODUCT-1', 'VARIANT-2', 2).intent).toBe(PurchaseIntent.Unknown);
    expect(coordinator.snapshot().storageResult).toBe(PurchaseIntentStorageResult.Unavailable);
  });
  it('abandons a detached pending observer on actor change without replay or permanent lock', () => {
    const old = ready();
    coordinator.beginConfirmation(actor);
    coordinator.invalidateAuthority();
    expect(coordinator.snapshot().confirmation).toBe(CartLineConfirmationResult.OutcomeUnknown);
    expect(coordinator.snapshot().stage).toBe(PurchaseIntentStage.Restoring);
    expect(coordinator.beginConfirmation(actor)).toBeNull();
    coordinator.markAccepted(old);
    expect(coordinator.snapshot().confirmation).toBe(CartLineConfirmationResult.OutcomeUnknown);
    const nextActor = { ...actor, identity: 'customer-b', revision: 2 };
    const next = coordinator.claim(old.flowId, nextActor)!;
    expect(next).not.toBeNull();
    coordinator.restore(next, product, cart);
    expect(coordinator.snapshot().confirmation).toBe(CartLineConfirmationResult.OutcomeUnknown);
    expect(coordinator.beginConfirmation(nextActor)).toBe(next);
  });
});
