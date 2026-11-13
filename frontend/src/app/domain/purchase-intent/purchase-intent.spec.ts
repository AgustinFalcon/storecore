import { CartLineConfirmationResult, PURCHASE_INTENT_TTL_MS, PurchaseIntent, PurchaseIntentKind, PurchaseIntentStage, RestoredPurchaseAvailability, validPurchaseFlowId } from './purchase-intent';

describe('PurchaseIntent closed wire boundary', () => {
  const now = 1000000;
  const intent = PurchaseIntent.capture('opaque-flow-id-001', 'PRODUCT-1', 'VARIANT-2', 2, now);
  it('round trips only the permitted same-tab selection fields', () => {
    expect(PurchaseIntent.fromWire(intent.toWire(), now)).toEqual(intent);
    expect(Object.keys(intent.toWire()).sort()).toEqual(['version', 'flowId', 'kind', 'productSku', 'variantSku', 'quantity', 'issuedAt', 'expiresAt'].sort());
    expect(intent.expiresAt - intent.issuedAt).toBe(PURCHASE_INTENT_TTL_MS);
  });
  for (const [field, value] of [['version', 2], ['kind', 'FUTURE'], ['flowId', '/catalog/a'], ['productSku', ''], ['productSku', 'x'.repeat(129)], ['variantSku', '   '], ['quantity', 0], ['quantity', -1], ['quantity', 1.5], ['quantity', 1000], ['quantity', '2'], ['expiresAt', now + 1], ['issuedAt', now + 1], ['cookie', 'secret']]) {
    it(`rejects invalid ${field}=${value}`, () => {
      expect(PurchaseIntent.fromWire({ ...intent.toWire(), [field]: value }, now)).toBe(PurchaseIntent.Unknown);
    });
  }
  it('accepts the canonical 128-character and unicode SKU range without treating it as a URL', () => {
    const productSku = `${'x'.repeat(125)}+ñ`;
    const variantSku = 'taladro / edición + azul';
    const captured = PurchaseIntent.capture('opaque-flow-id-wide', productSku, variantSku, 1, now);
    expect(captured.productSku).toBe(productSku);
    expect(captured.variantSku).toBe(variantSku);
  });
  it('rejects unknown records, encoded references, missing fields and the exact expiry boundary', () => {
    for (const raw of [null, [], 'raw', {}, { ...intent.toWire(), quantity: undefined }]) expect(PurchaseIntent.fromWire(raw, now)).toBe(PurchaseIntent.Unknown);
    expect(PurchaseIntent.fromWire(intent.toWire(), intent.expiresAt)).toBe(PurchaseIntent.Unknown);
    expect(validPurchaseFlowId('%6fpaque-flow-id-001')).toBe(false);
  });
  it('revises selection without extending the original TTL', () => {
    const revised = intent.revise('VARIANT-3', 3, now + 500);
    expect(revised.variantSku).toBe('VARIANT-3');
    expect(revised.expiresAt).toBe(intent.expiresAt);
  });
  it('translates every closed state and fails closed on future strings', () => {
    expect(PurchaseIntentKind.fromWire('ADD_CART_LINE')).toBe(PurchaseIntentKind.AddCartLine);
    expect(PurchaseIntentKind.fromWire('NONE')).toBe(PurchaseIntentKind.None);
    for (const type of [PurchaseIntentKind, PurchaseIntentStage, CartLineConfirmationResult, RestoredPurchaseAvailability]) expect(type.fromWire('FUTURE')).toBe(type.Unknown);
    for (const stage of [PurchaseIntentStage.Captured, PurchaseIntentStage.AwaitingCustomer, PurchaseIntentStage.Restoring, PurchaseIntentStage.ReadyForConfirmation, PurchaseIntentStage.Unavailable, PurchaseIntentStage.Expired, PurchaseIntentStage.Completed]) expect(PurchaseIntentStage.fromWire(stage.wire)).toBe(stage);
    for (const result of [CartLineConfirmationResult.Idle, CartLineConfirmationResult.Pending, CartLineConfirmationResult.Accepted, CartLineConfirmationResult.Rejected, CartLineConfirmationResult.OutcomeUnknown]) expect(CartLineConfirmationResult.fromWire(result.wire)).toBe(result);
    for (const availability of [RestoredPurchaseAvailability.Ready, RestoredPurchaseAvailability.ProductUnavailable, RestoredPurchaseAvailability.VariantUnavailable, RestoredPurchaseAvailability.QuantityUnavailable]) expect(RestoredPurchaseAvailability.fromWire(availability.wire)).toBe(availability);
  });
});
