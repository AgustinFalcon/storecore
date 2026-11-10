import { InventoryState } from '../catalog/catalog-states';
import { ConfirmInventoryAdjustmentStep, EditInventoryAdjustmentStep, InventoryAdjustmentLookup, InventoryAdjustmentOutcome, InventoryAdjustmentPhase, InventoryAdjustmentRejection, InventoryAdjustmentRequestError, RecoverInventoryAdjustmentStep, ReviewInventoryAdjustmentStep } from './inventory-adjustment';
import { InventoryAvailability } from './inventory-availability';
const balance = { available: 8, reserved: 3, safety: 2 };
const id = '12345678-1234-4234-8234-123456789012';
describe('Inventory adjustment domain', () => {
  it('closes every operation discriminator and never recognizes future values', () => {
    const classes = [InventoryAdjustmentPhase, InventoryAdjustmentOutcome, InventoryAdjustmentLookup, InventoryAdjustmentRejection, InventoryAdjustmentRequestError];
    for (const type of classes) {
      expect(type.fromWire('FUTURE')).toBe(type.Unknown); expect(type.fromWire(null)).toBe(type.Unknown);
      for (const value of Object.values(type)) if (value && typeof value === 'object' && 'wire' in value && value !== type.Unknown) expect(type.fromWire(value.wire)).toBe(value);
    }
  });
  it('parses exact signed Int32 and validates the resulting available without subtracting reserves', () => {
    const step = new ReviewInventoryAdjustmentStep();
    for (const value of ['', '0', '-0', '1.2', '1e2', '0x10', '2abc', '2147483648', '-2147483649']) expect(step.delta(value)).toBeNull();
    expect(step.delta('+5')).toBe(5); expect(step.delta('-2147483648')).toBe(-2147483648);
    expect(step.proposed(balance, '-2')).toEqual({ available: 6, reserved: 3, safety: 2 });
    expect(step.error(balance, '-9', 'reason')).toBeTruthy(); expect(step.error(balance, '1', ' '.repeat(5))).toBeTruthy(); expect(step.error(balance, '1', 'x'.repeat(501))).toBeTruthy();
    expect(step.error({ ...balance, available: 2147483647 }, '+1', 'reason')).toBeTruthy();
  });
  it('opens only known complete balances and freezes a normalized reviewed command', () => {
    const row = { variantId: '42', sku: 'SKU', state: InventoryState.Known, availableQuantity: 8, reservedQuantity: 3, safetyStock: 2, productName: '', variantLabel: '', onHand: 11, saleable: 6, updatedAt: null, availability: InventoryAvailability.Normal };
    expect(new EditInventoryAdjustmentStep().execute(row)).toEqual(balance);
    expect(new EditInventoryAdjustmentStep().execute({ ...row, state: InventoryState.Unknown })).toBeNull();
    const command = new ConfirmInventoryAdjustmentStep().execute('42', balance, '-2', '  Conteo  ', id)!;
    expect(command.reason).toBe('Conteo'); expect(Object.isFrozen(command)).toBe(true); expect(Object.isFrozen(command.expected)).toBe(true);
    expect(new RecoverInventoryAdjustmentStep().accepts(command, { commandId: 'other', variantId: '42', outcome: InventoryAdjustmentOutcome.Applied, rejection: InventoryAdjustmentRejection.Unknown, before: balance, after: balance, ledgerId: '1', recordedAt: '' })).toBe(false);
  });
});
