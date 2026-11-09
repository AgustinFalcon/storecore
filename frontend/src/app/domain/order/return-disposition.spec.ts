import { ConfirmDispositionStep, DamageReason, EditDispositionStep, RejectionReason, ReturnDisposition, ReturnDispositionState, ReviewDispositionStep } from './return-disposition';

function received(): ReturnDisposition { return { orderId: '1', returnId: '2', state: ReturnDispositionState.Editable, confirmedAt: null, lines: [{ returnItemId: '3', orderItemId: '4', sku: 'A', name: 'Artículo', quantity: 2, classification: null }] }; }
describe('Return disposition closed domain', () => {
  it('translates only known state and reason values', () => {
    expect(ReturnDispositionState.fromWire('EDITABLE')).toBe(ReturnDispositionState.Editable);
    expect(ReturnDispositionState.fromWire('future')).toBe(ReturnDispositionState.Unknown);
    expect(DamageReason.fromWire('COSMETIC')).toBe(DamageReason.Cosmetic);
    expect(DamageReason.fromWire('cosmetic')).toBe(DamageReason.Unknown);
    expect(RejectionReason.fromWire(null)).toBe(RejectionReason.Unknown);
  });
  it('starts unclassified without presuming that received items are saleable', () => {
    const draft = new EditDispositionStep().execute(received());
    expect(draft[0].restockQuantity).toBe(0);
    expect(new ReviewDispositionStep().validate(received(), draft)).not.toBeNull();
  });
  it('requires an exact partition and the relevant closed reasons', () => {
    const model = received(), review = new ReviewDispositionStep();
    const line = { ...new EditDispositionStep().execute(model)[0], restockQuantity: 1, damagedQuantity: 1, damageReason: DamageReason.Cosmetic };
    expect(review.validate(model, [line])).toBeNull();
    for (const invalid of [{ ...line, restockQuantity: 2 }, { ...line, damagedQuantity: -1 }, { ...line, damagedQuantity: .5 }, { ...line, damageReason: null }, { ...line, returnItemId: '8' }, { ...line, observation: 'x'.repeat(501) }]) expect(review.validate(model, [invalid])).not.toBeNull();
    expect(review.validate(model, [line, line])).not.toBeNull();
  });
  it('rejects unknown/historical evidence and only forms a command after valid review', () => {
    const model = received(), lines = [{ ...new EditDispositionStep().execute(model)[0], rejectedQuantity: 2, rejectionReason: RejectionReason.NotOurItem }];
    const confirm = new ConfirmDispositionStep();
    expect(confirm.execute(model, lines, '12345678-1234-1234-1234-123456789012')).not.toBeNull();
    expect(confirm.execute(model, lines, 'bad-key')).toBeNull();
    expect(confirm.execute({ ...model, state: ReturnDispositionState.HistoricalIncomplete }, lines, '12345678-1234-1234-1234-123456789012')).toBeNull();
  });
});
