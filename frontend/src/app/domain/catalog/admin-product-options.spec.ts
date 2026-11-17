import {
  AdminProductOptionsMapper, ConflictResolutionChoice, OptionDraftRebase, optionAssignmentValue, optionCommand, optionDraft, validateOptionDraft,
} from './admin-product-options';
import { OptionPresentation, OptionSchemaState } from './option-schema';

function wire(revision = 1): unknown {
  return { revision, state: 'VALID', cause: null, axes: [{ code: 'color', label: 'Color', presentation: 'SELECT', order: 10,
    values: [{ code: 'red', label: 'Rojo', order: 20, swatchColor: null }, { code: 'blue', label: 'Azul', order: 30, swatchColor: null }] }],
  assignments: [
    { variantId: '9007199254740991', variantSku: 'ACTIVE', active: true, optionValues: { color: 'red' } },
    { variantId: '9007199254740992', variantSku: 'INACTIVE', active: false, optionValues: { color: 'red' } },
  ] };
}

describe('admin product options closed domain', () => {
  it('accepts inactive duplicate combinations and preserves string identities', () => {
    const snapshot = AdminProductOptionsMapper.fromWire(wire());
    expect(snapshot.schema.state).toBe(OptionSchemaState.Valid);
    expect(snapshot.assignments).toHaveLength(2);
    expect(snapshot.assignments[1].variantId).toBe('9007199254740992');
  });

  it('normalizes authoritative sparse order before editing', () => {
    const draft = optionDraft(AdminProductOptionsMapper.fromWire(wire()));
    expect(draft.axes[0].order).toBe(0);
    expect(draft.axes[0].values.map(value => value.order)).toEqual([0, 1]);
  });

  it('rejects colors on select and normalized duplicate labels', () => {
    const draft = optionDraft(AdminProductOptionsMapper.fromWire(wire()));
    expect(validateOptionDraft({ ...draft, axes: [{ ...draft.axes[0], values: [{ ...draft.axes[0].values[0], swatchColor: '#ffffff' }] }] }).valid).toBe(false);
    expect(validateOptionDraft({ ...draft, axes: [{ ...draft.axes[0], presentation: OptionPresentation.Swatch,
      values: [{ ...draft.axes[0].values[0], label: 'Único' }, { ...draft.axes[0].values[1], label: 'u\u0301nico' }] }] }).valid).toBe(false);
  });

  it('serializes an inactive addition only as AddInactive', () => {
    const base = AdminProductOptionsMapper.fromWire(wire()), draft = optionDraft(base);
    const command = optionCommand(base, { ...draft, pendingAdditions: [{ localId: 'local-1', sku: 'NEW-1', label: 'Nueva' }] });
    expect(command.variantOperations).toContainEqual({ operation: 'AddInactive', sku: 'NEW-1', label: 'Nueva' });
    expect(command.assignments).not.toContainEqual(expect.objectContaining({ variantSku: 'NEW-1' }));
  });

  it('treats inherited axis names as unassigned and enforces the total variant cap', () => {
    expect(optionAssignmentValue({ optionValues: new Map() }, 'constructor')).toBe('');
    const base = optionDraft(AdminProductOptionsMapper.fromWire(wire()));
    const rows = Array.from({ length: 1000 }, (_, index) => ({ ...base.assignments[1], variantId: String(index), variantSku: `SKU-${index}` }));
    expect(validateOptionDraft({ ...base, assignments: rows.slice(0, 999), pendingAdditions: [{ localId: 'ok', sku: 'NEW', label: 'Nueva' }] }).valid).toBe(true);
    const overflow = validateOptionDraft({ ...base, assignments: rows, pendingAdditions: [{ localId: 'overflow', sku: 'EXTRA', label: 'Extra' }] });
    expect(overflow.valid).toBe(false);
    expect(overflow.message).toContain('1.000');
  });

  it('roundtrips an own constructor assignment through Map and the wire object', () => {
    const base = AdminProductOptionsMapper.fromWire({ revision: 1, state: 'VALID', cause: null,
      axes: [{ code: 'constructor', label: 'Constructor', presentation: 'SELECT', order: 0, values: [{ code: 'own', label: 'Propio', order: 0, swatchColor: null }] }],
      assignments: [{ variantId: '1', variantSku: 'SKU', active: true, optionValues: { constructor: 'own' } }] });
    const draft = optionDraft(base);
    expect(optionAssignmentValue(draft.assignments[0], 'constructor')).toBe('own');
    const command = optionCommand(base, draft);
    const serialized = command.assignments[0] as { optionValues: Record<string, string> };
    expect(Object.hasOwn(serialized.optionValues, 'constructor')).toBe(true);
    expect(serialized.optionValues.constructor).toBe('own');
  });

  it('makes remove-versus-edit hierarchical and honors the explicit choice', () => {
    const base = optionDraft(AdminProductOptionsMapper.fromWire(wire()));
    const mine = { ...base, axes: [{ ...base.axes[0], values: base.axes[0].values.map(value => value.code === 'red' ? { ...value, label: 'Rojo mío' } : value) }] };
    const remote = { ...base, axes: [] };
    const conflicts = OptionDraftRebase.conflicts(base, mine, remote);
    expect(conflicts.some(row => row.path === 'axis/color/exists')).toBe(true);
    const mineResult = OptionDraftRebase.merge(base, mine, remote, new Map([['axis/color/exists', ConflictResolutionChoice.Mine]]));
    const remoteResult = OptionDraftRebase.merge(base, mine, remote, new Map([['axis/color/exists', ConflictResolutionChoice.Remote]]));
    expect(mineResult?.axes[0].values[0].label).toBe('Rojo mío');
    expect(remoteResult?.axes).toHaveLength(0);
  });
});
