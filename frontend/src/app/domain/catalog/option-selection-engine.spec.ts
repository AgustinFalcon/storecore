import { OptionPresentation, OptionResolutionCause, OptionSchemaState, OptionSelectionState, OptionValueAvailability } from './option-schema';
import { OptionSelectionEngine, OptionVariantFacts } from './option-selection-engine';
import { OptionWireMapper, OptionVariantWire } from './option-wire.mapper';

const axes = ['a', 'b', 'c'].map((code, order) => ({ code, label: code, order, presentation: OptionPresentation.Select.wire,
  values: ['x', 'y', 'z'].map((value, order) => ({ code: value, label: value, order })) }));
const variants: readonly OptionVariantWire[] = [
  { id: '1', sku: 'sku1', optionValues: { a: 'x', b: 'x', c: 'x' } },
  { id: '2', sku: 'sku2', optionValues: { a: 'y', b: 'y', c: 'x' } },
  { id: '3', sku: 'sku3', optionValues: { a: 'y', b: 'x', c: 'y' } },
];
const wire = { state: OptionSchemaState.Valid.wire, revision: 1, cause: null, axes };
const facts: readonly OptionVariantFacts[] = variants.map(variant => ({ variantId: variant.id as string, priceKnown: true, availableQuantity: 10 }));
function engine(overrides: readonly OptionVariantFacts[] = facts): OptionSelectionEngine {
  return new OptionSelectionEngine(OptionWireMapper.fromWire(wire, variants), overrides);
}

describe('deterministic option selection', () => {
  it('starts from exact route SKU and quantity; another route defaults to one', () => {
    const subject = engine();
    const selected = subject.start('sku2', 4);
    expect(selected.state).toBe(OptionSelectionState.Complete);
    expect(selected.variant?.variantId).toBe('2');
    expect(selected.quantity).toBe(4);
    expect(selected.canPurchase).toBe(true);
    expect(subject.start('sku3').quantity).toBe(1);
    expect(subject.start('missing').state).toBe(OptionSelectionState.Unavailable);
  });

  it('does not autocomplete a partial prefix with either one or several candidates', () => {
    const subject = engine();
    for (const value of ['x', 'y']) {
      const selection = subject.choose(subject.start(null), 'a', value);
      expect(selection.state).toBe(OptionSelectionState.Incomplete);
      expect(selection.cause).toBe(OptionResolutionCause.Partial);
      expect(selection.values.size).toBe(1);
      expect(selection.variant).toBeNull();
      expect(selection.canPurchase).toBe(false);
    }
  });

  it('clears only incompatible later values and preserves compatible values past a gap', () => {
    const subject = engine();
    const selection = subject.choose(subject.start('sku2', 6), 'a', 'x');
    expect(Array.from(selection.values)).toEqual([['a', 'x'], ['c', 'x']]);
    expect(selection.state).toBe(OptionSelectionState.Incomplete);
    expect(selection.quantity).toBe(6);
    expect(selection.variant).toBeNull();
  });

  it('keeps compatible later values without changing previous selections', () => {
    const subject = engine();
    const selection = subject.choose(subject.start('sku1'), 'a', 'y');
    expect(Array.from(selection.values)).toEqual([['a', 'y'], ['b', 'x']]);
    expect(selection.state).toBe(OptionSelectionState.Incomplete);
  });

  it('distinguishes impossible complete combinations from incomplete vectors', () => {
    const selection = engine().resolve(new Map([['a', 'x'], ['b', 'y'], ['c', 'y']]));
    expect(selection.state).toBe(OptionSelectionState.Unavailable);
    expect(selection.cause).toBe(OptionResolutionCause.NoCombination);
    expect(selection.variant).toBeNull();
    expect(selection.canPurchase).toBe(false);
  });

  it.each([
    [{ variantId: '1', priceKnown: false, availableQuantity: 10 }, OptionResolutionCause.PriceUnavailable],
    [{ variantId: '1', priceKnown: true, availableQuantity: 0 }, OptionResolutionCause.OutOfStock],
  ] as const)('retains resolved identity when commercial facts block purchase', (fact, cause) => {
    const selection = engine([fact]).start('sku1');
    expect(selection.state).toBe(OptionSelectionState.Unavailable);
    expect(selection.variant?.sku).toBe('sku1');
    expect(selection.cause).toBe(cause);
    expect(selection.canPurchase).toBe(false);
  });

  it('fails closed without retaining identity when inventory cannot be verified', () => {
    const selection = engine([{ variantId: '1', priceKnown: true, availableQuantity: null }]).start('sku1');
    expect(selection.state).toBe(OptionSelectionState.Unknown);
    expect(selection.cause).toBe(OptionResolutionCause.Unknown);
    expect(selection.values.size).toBe(0);
    expect(selection.variant).toBeNull();
    expect(selection.canPurchase).toBe(false);
  });

  it('fails closed when the resolved variant has no commercial facts', () => {
    const selection = engine([]).start('sku1');
    expect(selection.state).toBe(OptionSelectionState.Unknown);
    expect(selection.cause).toBe(OptionResolutionCause.Unknown);
    expect(selection.variant).toBeNull();
    expect(selection.canPurchase).toBe(false);
  });

  it.each([0, -1, 1.5, 11, Number.NaN])('keeps invalid quantity %p visible and blocks confirmation', quantity => {
    const subject = engine();
    const selection = subject.withQuantity(subject.start('sku1'), quantity);
    expect(selection.quantity).toBe(quantity);
    expect(selection.state).toBe(OptionSelectionState.Complete);
    expect(selection.canPurchase).toBe(false);
  });

  it('preserves quantity above new stock rather than silently clamping', () => {
    const subject = engine(facts.map(fact => ({ ...fact, availableQuantity: fact.variantId === '2' ? 2 : 10 })));
    const selection = subject.resolve(new Map([['a', 'y'], ['b', 'y'], ['c', 'x']]), 7);
    expect(selection.variant?.sku).toBe('sku2');
    expect(selection.quantity).toBe(7);
    expect(selection.canPurchase).toBe(false);
  });

  it('reports selected/selectable/disabled using only the current prefix', () => {
    const subject = engine(), selected = subject.start('sku1');
    expect(subject.valueChoice(selected, 'a', 'x').availability).toBe(OptionValueAvailability.Selected);
    expect(subject.valueChoice(selected, 'a', 'y').availability).toBe(OptionValueAvailability.Selectable);
    expect(subject.valueChoice(selected, 'b', 'y')).toEqual({ availability: OptionValueAvailability.Disabled, cause: OptionResolutionCause.NoCombination });
    expect(subject.valueChoice(selected, 'a', 'z').availability).toBe(OptionValueAvailability.Disabled);
    expect(subject.valueChoice(selected, 'constructor', 'x').availability).toBe(OptionValueAvailability.Unknown);
  });

  it('rejects unknown selections and never uses generic fallback for valid or corrupt schemas', () => {
    const subject = engine();
    expect(subject.resolve(new Map([['constructor', 'x']])).state).toBe(OptionSelectionState.Unknown);
    expect(subject.selectGeneric('sku1').state).toBe(OptionSelectionState.Unknown);
    const corrupt = new OptionSelectionEngine(OptionWireMapper.fromWire(wire, [...variants, { ...variants[0], id: '4', sku: 'duplicate' }]), facts);
    expect(corrupt.start('sku1').state).toBe(OptionSelectionState.Unknown);
    expect(corrupt.selectGeneric('sku1').canPurchase).toBe(false);
  });

  it('allows only explicit Absent generic fallback, including legacy multi-variant products', () => {
    const absent = { state: OptionSchemaState.Absent.wire, revision: 1, cause: null, axes: [] };
    const legacy = variants.map(variant => ({ id: variant.id, sku: variant.sku }));
    const subject = new OptionSelectionEngine(OptionWireMapper.fromWire(absent, legacy), facts);
    expect(subject.start(null).state).toBe(OptionSelectionState.Incomplete);
    expect(subject.selectGeneric('sku2').variant?.variantId).toBe('2');
    const simple = new OptionSelectionEngine(OptionWireMapper.fromWire(absent, [legacy[0]]), facts);
    expect(simple.start(null).canPurchase).toBe(true);
    const revalidated = simple.withQuantity(subject.selectGeneric('sku2'), 2);
    expect(revalidated.state).toBe(OptionSelectionState.Incomplete);
    expect(revalidated.variant).toBeNull();
    expect(revalidated.canPurchase).toBe(false);
  });

  it('rejects duplicate commercial facts and copies selection maps', () => {
    expect(engine([...facts, facts[0]]).start('sku1').state).toBe(OptionSelectionState.Unknown);
    const values = new Map([['a', 'x']]);
    const selected = engine().resolve(values);
    values.set('b', 'y');
    expect(selected.values.has('b')).toBe(false);
    expect('set' in selected.values).toBe(false);
  });
});
