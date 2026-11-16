import { OPTION_MAX_WIRE_INTEGER, OptionCode, OptionLabel, OptionPresentation, OptionResolutionCause, OptionSchemaState,
  OptionSelectionState, OptionValueAvailability, SchemaRevision, SwatchColor } from './option-schema';
import { OptionAxisWire, OptionWireMapper, OptionSchemaWire, OptionVariantWire } from './option-wire.mapper';

function axis(code = 'a', order = 0): OptionAxisWire {
  return { code, label: code, order, presentation: OptionPresentation.Select.wire,
    values: [{ code: 'x', label: 'X', order: 0 }, { code: 'y', label: 'Y', order: 1 }] };
}
function schema(axes: readonly OptionAxisWire[] = [axis()]): OptionSchemaWire {
  return { state: OptionSchemaState.Valid.wire as 'VALID', revision: 1, cause: null, axes };
}
const variant = { id: 'id', sku: 'sku', optionValues: { a: 'x' } };

describe('option wire boundary', () => {
  it('normalizes labels and sorts noncontiguous orders without inferring descriptive attributes', () => {
    const mapped = OptionWireMapper.fromWire(schema([axis('b', 50), { ...axis('a', 10), label: '  First   axis  ' }]),
      [{ ...variant, optionValues: { a: 'x', b: 'y' } }]);
    expect(mapped.schema.state).toBe(OptionSchemaState.Valid);
    expect(mapped.schema.axes.map(axis => axis.code.value)).toEqual(['a', 'b']);
    expect(mapped.schema.axes[0].label.value).toBe('First axis');
  });

  it.each([undefined, null, {}, { state: 'FUTURE', revision: 1 },
    { ...schema(), state: 'INVALID' }, { ...schema(), revision: 0 }, { ...schema(), cause: 'CORRUPT' },
    schema([]), schema(Array.from({ length: 5 }, (_, index) => axis(`a${index}`, index))),
    schema([{ ...axis(), presentation: OptionPresentation.Unknown.wire }]),
    schema([{ ...axis(), values: [] }]),
    schema([{ ...axis(), code: '__proto__' }]), schema([{ ...axis(), label: 'bad\u0000' }]),
    schema([{ ...axis(), label: 'x'.repeat(81) }]), schema([axis(), axis()]),
    schema([{ ...axis(), order: OPTION_MAX_WIRE_INTEGER + 1 }]),
    schema([axis(), { ...axis('b', 1), label: ' A ' }]),
    schema([axis(), axis('b')]),
    schema([{ ...axis(), values: [{ code: 'x', label: 'X', order: 0 }, { code: 'x', label: 'Y', order: 1 }] }]),
    schema([{ ...axis(), values: Array.from({ length: 51 }, (_, index) => ({ code: `v${index}`, label: `V${index}`, order: index })) }]),
    schema([{ ...axis(), values: [{ code: 'x', label: 'X', order: 0, swatchColor: '#abcdef' }] }]),
    schema([{ ...axis(), presentation: OptionPresentation.Swatch.wire, values: [{ code: 'x', label: 'X', order: 0, swatchColor: 'url(a)' }] }]),
  ])('fails closed for malformed schema %p', raw => {
    const result = OptionWireMapper.fromWire(raw, [variant]);
    expect(result.schema.state).toBe(OptionSchemaState.Unknown);
    expect(result.schema.state.allowsGeneric).toBe(false);
  });

  it.each([
    [{ ...variant, id: '' }], [{ ...variant, sku: ' ' }], [variant, { ...variant, sku: 'other' }],
    [variant, { ...variant, id: 'other' }], [variant, { ...variant, id: 'other', sku: 'other' }],
    [{ ...variant, optionValues: {} }], [{ ...variant, optionValues: { a: 'missing' } }],
    [{ ...variant, optionValues: { a: 'x', b: 'x' } }],
    Array.from({ length: 1001 }, () => variant),
  ].map(variants => ({ variants })))('rejects invalid or ambiguous public assignments', ({ variants }) => {
    expect(OptionWireMapper.fromWire(schema(), variants).schema.state).toBe(OptionSchemaState.Unknown);
  });

  it('does not read inherited axis assignments or prototype members', () => {
    expect(OptionWireMapper.fromWire(schema(), [{ ...variant, optionValues: Object.create({ a: 'x' }) }]).schema.state)
      .toBe(OptionSchemaState.Unknown);
    const mapped = OptionWireMapper.fromWire(schema([axis('constructor')]),
      [{ ...variant, optionValues: { constructor: 'x' } } as unknown as OptionVariantWire]);
    expect(mapped.schema.state).toBe(OptionSchemaState.Valid);
    expect(mapped.variants[0].values.get('constructor')).toBe('x');
  });

  it('permits only explicit Absent fallback and validates legacy identities', () => {
    const absent = { state: OptionSchemaState.Absent.wire, revision: 1, cause: null, axes: [] };
    expect(OptionWireMapper.fromWire(absent, [{ id: 'id', sku: 'sku' }]).schema.state).toBe(OptionSchemaState.Absent);
    expect(OptionWireMapper.fromWire(absent, [variant]).schema.state).toBe(OptionSchemaState.Unknown);
    expect(OptionWireMapper.fromWire({ ...absent, axes: [axis()] }, []).schema.state).toBe(OptionSchemaState.Unknown);
    expect(OptionWireMapper.fromWire(absent, [{ id: 'id', sku: 'sku' }, { id: 'id2', sku: 'sku' }]).schema.state).toBe(OptionSchemaState.Unknown);
  });

  it('preserves known failure causes and translates future causes to Unknown', () => {
    const unknown = { ...schema(), state: OptionSchemaState.Unknown.wire, cause: OptionResolutionCause.Corrupt.wire, axes: [] };
    expect(OptionWireMapper.fromWire(unknown, []).schema.cause).toBe(OptionResolutionCause.Corrupt);
    expect(OptionWireMapper.fromWire({ ...unknown, cause: 'FUTURE' }, []).schema.cause).toBe(OptionResolutionCause.Unknown);
  });

  it('accepts optional safe swatches while keeping textual identity', () => {
    const result = OptionWireMapper.fromWire(schema([{ ...axis(), presentation: OptionPresentation.Swatch.wire,
      values: [{ code: 'x', label: 'X', order: 0, swatchColor: '#abcdef' }, { code: 'y', label: 'Y', order: 1 }] }]), [variant]);
    expect(result.schema.state).toBe(OptionSchemaState.Valid);
    expect(result.schema.axes[0].values[0].swatchColor?.value).toBe('#abcdef');
    expect(result.schema.axes[0].values[1].swatchColor).toBeNull();
  });

  it('accepts four axes, fifty values per axis and one thousand real assignments without generating a cartesian product', () => {
    const axes = Array.from({ length: 4 }, (_, index) => ({ ...axis(`a${index}`, index),
      values: Array.from({ length: 50 }, (_, order) => ({ code: `v${order}`, label: `V${order}`, order })) }));
    const variants = Array.from({ length: 1000 }, (_, index) => ({ id: `id${index}`, sku: `sku${index}`,
      optionValues: Object.fromEntries(axes.map((axis, position) => [axis.code, `v${Math.floor(index / 50 ** position) % 50}`])) }));
    const result = OptionWireMapper.fromWire(schema(axes), variants);
    expect(result.schema.state).toBe(OptionSchemaState.Valid);
    expect(result.schema.axes).toHaveLength(4);
    expect(result.variants).toHaveLength(1000);
    expect(result.variants.reduce((count, variant) => count + variant.values.size, 0)).toBe(4000);
  });
});

describe('option value objects', () => {
  it('freezes every closed singleton at runtime', () => {
    for (const value of [OptionPresentation.Select, OptionPresentation.Swatch, OptionPresentation.Unknown,
      OptionSchemaState.Absent, OptionSchemaState.Valid, OptionSchemaState.Invalid, OptionSchemaState.Unknown,
      OptionSelectionState.Complete, OptionSelectionState.Incomplete, OptionSelectionState.Unavailable, OptionSelectionState.Unknown,
      OptionValueAvailability.Selectable, OptionValueAvailability.Selected, OptionValueAvailability.Disabled, OptionValueAvailability.Unknown,
      OptionResolutionCause.Partial, OptionResolutionCause.NoCombination, OptionResolutionCause.OutOfStock,
      OptionResolutionCause.PriceUnavailable, OptionResolutionCause.Corrupt, OptionResolutionCause.Unknown]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });
  it.each(['', 'A', 'a b', '-a', 'a'.repeat(65)])('rejects noncanonical code %p', value => {
    expect(() => OptionCode.create(value)).toThrow();
  });
  it('folds Unicode duplicate labels and retains distinct dotless i', () => {
    expect(OptionLabel.create('Straße').comparisonKey).toBe(OptionLabel.create('STRASSE').comparisonKey);
    expect(OptionLabel.create('Straße').comparisonKey).toBe(OptionLabel.create('STRAẞE').comparisonKey);
    expect(OptionLabel.create('Σ').comparisonKey).toBe(OptionLabel.create('ς').comparisonKey);
    expect(OptionLabel.create('i').comparisonKey).not.toBe(OptionLabel.create('ı').comparisonKey);
  });
  it.each([0, -1, 1.2, OPTION_MAX_WIRE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 1, Number.NaN])('rejects unsafe revision %p', value => {
    expect(() => SchemaRevision.create(value)).toThrow();
  });
  it('accepts the shared maximum wire integer revision', () => {
    expect(SchemaRevision.create(OPTION_MAX_WIRE_INTEGER).value).toBe(OPTION_MAX_WIRE_INTEGER);
  });
  it.each(['#ABCDEF', '#123', 'red', 'url(x)'])('rejects unsafe swatch %p', value => {
    expect(() => SwatchColor.create(value)).toThrow();
  });
});
