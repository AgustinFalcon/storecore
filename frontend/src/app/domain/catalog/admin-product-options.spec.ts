import {
  AdminProductOptionsMapper, ConflictResolutionChoice, OptionDraftRebase, optionCommand, optionDraft, validateOptionDraft,
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
