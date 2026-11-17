import { NormalizeOptionSchemaStep } from './option-wire.mapper';
import {
  DomainReadonlyMap, OptionAxis, OptionCode, OptionLabel, OptionPresentation,
  OptionResolutionCause, OptionSchemaState, ProductOptionSchema, SwatchColor, SchemaRevision,
} from './option-schema';

export class OptionEditorPhase {
  private constructor(readonly wire: 'IDLE' | 'LOADING' | 'READY' | 'SAVING' | 'CONFLICT' | 'CONFLICT_READ_REQUIRED' | 'REFRESH_REQUIRED' | 'OUTCOME_UNKNOWN' | 'REVISION_EXHAUSTED' | 'SUCCESS' | 'ERROR',
    readonly label: string, readonly busy: boolean, readonly allowsDraft: boolean, readonly allowsPublish: boolean, readonly requiresReconciliation = false) {}
  static readonly Idle = Object.freeze(new OptionEditorPhase('IDLE', 'Elegí un producto persistido.', false, false, false));
  static readonly Loading = Object.freeze(new OptionEditorPhase('LOADING', 'Cargando opciones…', true, false, false));
  static readonly Ready = Object.freeze(new OptionEditorPhase('READY', 'Opciones listas para revisar.', false, true, true));
  static readonly Saving = Object.freeze(new OptionEditorPhase('SAVING', 'Guardando opciones…', true, false, false));
  static readonly Conflict = Object.freeze(new OptionEditorPhase('CONFLICT', 'La configuración publicada cambió.', false, false, false));
  static readonly ConflictReadRequired = Object.freeze(new OptionEditorPhase('CONFLICT_READ_REQUIRED', 'Falta leer la versión publicada para comparar.', false, false, false, true));
  static readonly RefreshRequired = Object.freeze(new OptionEditorPhase('REFRESH_REQUIRED', 'Guardado confirmado; falta actualizar la vista.', false, false, false, true));
  static readonly OutcomeUnknown = Object.freeze(new OptionEditorPhase('OUTCOME_UNKNOWN', 'No pudimos confirmar si el guardado se aplicó.', false, false, false, true));
  static readonly RevisionExhausted = Object.freeze(new OptionEditorPhase('REVISION_EXHAUSTED', 'La configuración agotó sus revisiones.', false, false, false));
  static readonly Success = Object.freeze(new OptionEditorPhase('SUCCESS', 'Opciones guardadas.', false, true, true));
  static readonly Error = Object.freeze(new OptionEditorPhase('ERROR', 'No se pudo completar la operación.', false, true, true));
  get isConflict(): boolean { return this === OptionEditorPhase.Conflict; }
  get isRevisionExhausted(): boolean { return this === OptionEditorPhase.RevisionExhausted; }
}

export class OptionSchemaCommandOperation {
  private constructor(readonly wire: 'Replace' | 'Clear') {}
  static readonly Replace = Object.freeze(new OptionSchemaCommandOperation('Replace'));
  static readonly Clear = Object.freeze(new OptionSchemaCommandOperation('Clear'));
}

export class VariantOptionCommandOperation {
  private constructor(readonly wire: 'Keep' | 'AddInactive' | 'Activate' | 'Deactivate') {}
  static readonly Keep = Object.freeze(new VariantOptionCommandOperation('Keep'));
  static readonly AddInactive = Object.freeze(new VariantOptionCommandOperation('AddInactive'));
  static readonly Activate = Object.freeze(new VariantOptionCommandOperation('Activate'));
  static readonly Deactivate = Object.freeze(new VariantOptionCommandOperation('Deactivate'));
}

export class ConflictResolutionChoice {
  private constructor(readonly wire: 'MINE' | 'REMOTE', readonly label: string) {}
  static readonly Mine = Object.freeze(new ConflictResolutionChoice('MINE', 'Mi borrador'));
  static readonly Remote = Object.freeze(new ConflictResolutionChoice('REMOTE', 'Publicado'));
}

export interface AdminOptionAssignment {
  readonly variantId: string;
  readonly variantSku: string;
  readonly active: boolean;
  readonly optionValues: ReadonlyMap<string, string>;
}
export interface AdminProductOptionsSnapshot {
  readonly revision: number;
  readonly schema: ProductOptionSchema;
  readonly assignments: readonly AdminOptionAssignment[];
}
export interface OptionValueDraft { readonly code: string; readonly label: string; readonly swatchColor: string; readonly order: number; }
export interface OptionAxisDraft { readonly code: string; readonly label: string; readonly presentation: OptionPresentation; readonly order: number; readonly values: readonly OptionValueDraft[]; }
export interface OptionAssignmentDraft { readonly variantId: string; readonly variantSku: string; readonly active: boolean; readonly optionValues: ReadonlyMap<string, string>; }
export interface PendingInactiveVariantDraft { readonly localId: string; readonly sku: string; readonly label: string; }
export interface AdminProductOptionsDraft { readonly axes: readonly OptionAxisDraft[]; readonly assignments: readonly OptionAssignmentDraft[]; readonly pendingAdditions: readonly PendingInactiveVariantDraft[]; }
export interface OptionConflictEntry {
  readonly path: string;
  readonly label: string;
  readonly base: string;
  readonly mine: string;
  readonly remote: string;
  readonly choice: ConflictResolutionChoice | null;
}
export interface ProductOptionsWriteResult { readonly revision: number; readonly state: OptionSchemaState; }
export interface VerifiedProductOptionsSnapshot { readonly sku: string; readonly snapshot: AdminProductOptionsSnapshot; }
export interface ProductOptionsCommand {
  readonly expectedRevision: number;
  readonly operation: OptionSchemaCommandOperation;
  readonly axes: readonly unknown[];
  readonly assignments: readonly unknown[];
  readonly variantOperations: readonly unknown[];
}

type FlatValue = string | number | boolean | null;
type Flat = ReadonlyMap<string, FlatValue>;

function record(raw: unknown): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Objeto de opciones inválido.');
  return raw as Record<string, unknown>;
}
function text(raw: unknown): string { if (typeof raw !== 'string' || !raw.trim()) throw new Error('Identidad inválida.'); return raw; }
function revision(raw: unknown): number { return SchemaRevision.create(raw as number).value; }
function own(row: Record<string, unknown>, key: string): unknown { return Object.hasOwn(row, key) ? row[key] : undefined; }

/** Admin projection accepts partial inactive assignments but fails closed for every other inconsistency. */
export class AdminProductOptionsMapper {
  static fromWire(raw: unknown): AdminProductOptionsSnapshot {
    try {
      const row = record(raw);
      const schema = new NormalizeOptionSchemaStep().execute({ revision: own(row, 'revision'), state: own(row, 'state'), cause: own(row, 'cause'), axes: own(row, 'axes') });
      const rows = own(row, 'assignments');
      if (!Array.isArray(rows) || rows.length > 1000) throw new Error('Asignaciones inválidas.');
      if (schema.state === OptionSchemaState.Unknown && rows.length) throw new Error('Proyección desconocida inconsistente.');
      const identities = new Set<string>(), skus = new Set<string>(), complete = new Set<string>();
      const assignments = rows.map(rawAssignment => {
        const assignment = record(rawAssignment), variantId = text(own(assignment, 'variantId')), variantSku = text(own(assignment, 'variantSku'));
        if (identities.has(variantId) || skus.has(variantSku) || typeof own(assignment, 'active') !== 'boolean') throw new Error('Variante duplicada.');
        identities.add(variantId); skus.add(variantSku);
        const valuesRow = record(own(assignment, 'optionValues') ?? {}), values = new Map<string, string>();
        if (Object.keys(valuesRow).length > 4) throw new Error('Asignación excedida.');
        for (const [axisCode, rawValue] of Object.entries(valuesRow)) {
          const axis = schema.axes.find(value => value.code.value === OptionCode.create(axisCode).value);
          const valueCode = OptionCode.create(text(rawValue)).value;
          if (!axis?.values.some(value => value.code.value === valueCode)) throw new Error('Asignación fuera del schema.');
          values.set(axisCode, valueCode);
        }
        const active = own(assignment, 'active') as boolean;
        if (schema.state === OptionSchemaState.Absent && values.size) throw new Error('Asignación sin schema.');
        if (schema.state === OptionSchemaState.Valid && active && values.size !== schema.axes.length) throw new Error('Variante activa incompleta.');
        if (schema.state === OptionSchemaState.Valid && active && values.size === schema.axes.length) {
          const key = JSON.stringify(schema.axes.map(axis => [axis.code.value, values.get(axis.code.value)]));
          if (complete.has(key)) throw new Error('Combinación duplicada.'); complete.add(key);
        }
        return Object.freeze({ variantId, variantSku, active, optionValues: new DomainReadonlyMap(values) });
      });
      return Object.freeze({ revision: revision(own(row, 'revision')), schema, assignments: Object.freeze(assignments) });
    } catch {
      return Object.freeze({ revision: 1, schema: Object.freeze({ revision: null, state: OptionSchemaState.Unknown,
        cause: OptionResolutionCause.Corrupt, axes: Object.freeze([]) }), assignments: Object.freeze([]) });
    }
  }

  static writeResult(raw: unknown): ProductOptionsWriteResult {
    const row = record(raw), state = own(row, 'state');
    const parsed = state === OptionSchemaState.Valid.wire ? OptionSchemaState.Valid
      : state === OptionSchemaState.Absent.wire ? OptionSchemaState.Absent : OptionSchemaState.Unknown;
    if (parsed === OptionSchemaState.Unknown) throw new Error('Respuesta de opciones no verificable.');
    return Object.freeze({ revision: revision(own(row, 'revision')), state: parsed });
  }
}

export function optionDraft(snapshot: AdminProductOptionsSnapshot): AdminProductOptionsDraft {
  return Object.freeze({ axes: Object.freeze([...snapshot.schema.axes].sort((left, right) => left.order - right.order).map((axis, axisOrder) => Object.freeze({ code: axis.code.value, label: axis.label.value,
    presentation: axis.presentation, order: axisOrder, values: Object.freeze([...axis.values].sort((left, right) => left.order - right.order).map((value, valueOrder) => Object.freeze({ code: value.code.value,
      label: value.label.value, swatchColor: value.swatchColor?.value ?? '', order: valueOrder }))) }))),
  assignments: Object.freeze(snapshot.assignments.map(row => Object.freeze({ variantId: row.variantId, variantSku: row.variantSku,
    active: row.active, optionValues: new DomainReadonlyMap(row.optionValues) }))), pendingAdditions: Object.freeze([]) });
}

export interface OptionDraftValidation { readonly valid: boolean; readonly message: string; }
export function optionAssignmentValue(assignment: Pick<OptionAssignmentDraft, 'optionValues'>, axisCode: string): string {
  return assignment.optionValues.get(axisCode) ?? '';
}
export function validateOptionDraft(draft: AdminProductOptionsDraft): OptionDraftValidation {
  try {
    if (draft.axes.length < 1 || draft.axes.length > 4) throw new Error('Definí entre 1 y 4 ejes.');
    if (draft.assignments.length + draft.pendingAdditions.length > 1000) throw new Error('El producto admite hasta 1.000 variantes, incluidas las altas pendientes.');
    const axes: OptionAxis[] = draft.axes.map((axis, index) => {
      if (axis.order !== index || (axis.presentation !== OptionPresentation.Select && axis.presentation !== OptionPresentation.Swatch)
        || axis.values.length < 1 || axis.values.length > 50) throw new Error('Revisá orden, presentación y valores.');
      return { code: OptionCode.create(axis.code), label: OptionLabel.create(axis.label), presentation: axis.presentation, order: index,
        values: axis.values.map((value, valueIndex) => {
          if (axis.presentation === OptionPresentation.Select && value.swatchColor) throw new Error(`La lista ${axis.label} no admite colores.`);
          return { code: OptionCode.create(value.code), label: OptionLabel.create(value.label), order: valueIndex,
            swatchColor: value.swatchColor ? SwatchColor.create(value.swatchColor) : null };
        }) };
    });
    if (new Set(axes.map(axis => axis.code.value)).size !== axes.length) throw new Error('Los códigos de eje deben ser únicos.');
    if (new Set(axes.map(axis => axis.label.comparisonKey)).size !== axes.length) throw new Error('Los nombres de eje deben ser únicos.');
    for (const axis of axes) {
      if (new Set(axis.values.map(value => value.code.value)).size !== axis.values.length) throw new Error(`Los códigos de valor de ${axis.label.value} deben ser únicos.`);
      if (new Set(axis.values.map(value => value.label.comparisonKey)).size !== axis.values.length) throw new Error(`Los nombres de valor de ${axis.label.value} deben ser únicos.`);
    }
    const combinations = new Set<string>();
    for (const assignment of draft.assignments) {
      const entries = [...assignment.optionValues.entries()];
      const complete = axes.every(axis => Boolean(optionAssignmentValue(assignment, axis.code.value)));
      if (assignment.active && (entries.length !== axes.length || !complete)) throw new Error(`Asigná todas las opciones a ${assignment.variantSku}.`);
      for (const [axisCode, valueCode] of entries) if (!axes.some(axis => axis.code.value === axisCode && axis.values.some(value => value.code.value === valueCode))) throw new Error(`Revisá la asignación de ${assignment.variantSku}.`);
      if (assignment.active && entries.length === axes.length && complete) {
        const key = JSON.stringify(axes.map(axis => [axis.code.value, optionAssignmentValue(assignment, axis.code.value)]));
        if (combinations.has(key)) throw new Error('Dos variantes no pueden compartir la misma combinación.'); combinations.add(key);
      }
    }
    const existingSkus = new Set(draft.assignments.map(row => row.variantSku.trim().toLocaleLowerCase('es-AR'))), pendingSkus = new Set<string>();
    for (const pending of draft.pendingAdditions) {
      const sku = pending.sku.trim(), label = pending.label.trim(), key = sku.toLocaleLowerCase('es-AR');
      if (!pending.localId || !sku || sku.length > 128 || !label || Array.from(label).length > 200 || existingSkus.has(key) || pendingSkus.has(key)) throw new Error('Revisá SKU y nombre de las variantes nuevas.');
      pendingSkus.add(key);
    }
    return { valid: true, message: '' };
  } catch (error) { return { valid: false, message: error instanceof Error ? error.message : 'Borrador inválido.' }; }
}

export function optionCommand(base: AdminProductOptionsSnapshot, draft: AdminProductOptionsDraft, operation = OptionSchemaCommandOperation.Replace): ProductOptionsCommand {
  if (operation === OptionSchemaCommandOperation.Clear) return { expectedRevision: base.revision, operation, axes: [], assignments: [], variantOperations: [] };
  const validation = validateOptionDraft(draft); if (!validation.valid) throw new Error(validation.message);
  const before = new Map(base.assignments.map(row => [row.variantId, row]));
  return { expectedRevision: base.revision, operation,
    axes: draft.axes.map(axis => ({ code: axis.code, label: axis.label, presentation: axis.presentation.wire, order: axis.order,
      values: axis.values.map(value => ({ code: value.code, label: value.label, order: value.order, swatchColor: value.swatchColor || null })) })),
    assignments: draft.assignments.map(row => ({ variantId: row.variantId, optionValues: Object.fromEntries(row.optionValues) })),
    variantOperations: [...draft.assignments.flatMap(row => {
      const prior = before.get(row.variantId); if (!prior || prior.active === row.active) return [];
      return [{ operation: row.active ? VariantOptionCommandOperation.Activate.wire : VariantOptionCommandOperation.Deactivate.wire, variantId: row.variantId }];
    }), ...draft.pendingAdditions.map(row => ({ operation: VariantOptionCommandOperation.AddInactive.wire, sku: row.sku.trim(), label: row.label.trim() }))] };
}

function flatten(draft: AdminProductOptionsDraft): Map<string, FlatValue> {
  const result = new Map<string, FlatValue>();
  for (const axis of draft.axes) {
    const root = `axis/${axis.code}`; result.set(`${root}/exists`, true); result.set(`${root}/label`, axis.label);
    result.set(`${root}/presentation`, axis.presentation.wire); result.set(`${root}/order`, axis.order);
    for (const value of axis.values) { const path = `${root}/value/${value.code}`; result.set(`${path}/exists`, true);
      result.set(`${path}/label`, value.label); result.set(`${path}/color`, value.swatchColor); result.set(`${path}/order`, value.order); }
  }
  for (const row of draft.assignments) { const root = `variant/${encodeURIComponent(row.variantId)}`; result.set(`${root}/exists`, true);
    result.set(`${root}/sku`, row.variantSku); result.set(`${root}/active`, row.active);
    for (const [axis, value] of row.optionValues) result.set(`${root}/option/${axis}`, value); }
  for (const row of draft.pendingAdditions) { const root = `pending/${encodeURIComponent(row.localId)}`; result.set(`${root}/exists`, true);
    result.set(`${root}/sku`, row.sku); result.set(`${root}/label`, row.label); }
  return result;
}
export function optionDraftEquals(left: AdminProductOptionsDraft, right: AdminProductOptionsDraft): boolean {
  const leftFlat = flatten(left), rightFlat = flatten(right);
  return leftFlat.size === rightFlat.size && [...leftFlat].every(([path, value]) => Object.is(value, rightFlat.get(path)));
}
function display(value: FlatValue | undefined): string { return value === undefined ? '—' : String(value); }
function pathLabel(path: string): string {
  const parts = path.split('/').map(decodeURIComponent), property = parts.at(-1);
  if (parts[0] === 'axis') return `Eje ${parts[1]} · ${parts[2] === 'value' ? `valor ${parts[3]} · ${parts[4]}` : property}`;
  if (parts[0] === 'variant') return `Variante ${parts[1]} · ${property}`;
  if (parts[0] === 'pending') return `Variante nueva · ${property}`;
  return path;
}
function structuralRoots(flat: Flat): readonly string[] {
  const roots = new Set<string>();
  for (const path of flat.keys()) {
    const value = /^(axis\/[^/]+\/value\/[^/]+)\/exists$/.exec(path)?.[1], axis = /^(axis\/[^/]+)\/exists$/.exec(path)?.[1];
    const variant = /^((?:variant|pending)\/[^/]+)\/exists$/.exec(path)?.[1];
    if (value) roots.add(value); if (axis) roots.add(axis); if (variant) roots.add(variant);
  }
  return [...roots].sort((left, right) => left.length - right.length);
}
function descendantChanged(base: Flat, candidate: Flat, root: string): boolean {
  const paths = new Set([...base.keys(), ...candidate.keys()]), exists = `${root}/exists`, prefix = `${root}/`;
  return [...paths].some(path => path !== exists && path.startsWith(prefix) && !Object.is(base.get(path), candidate.get(path)));
}

export class OptionDraftRebase {
  static conflicts(base: AdminProductOptionsDraft, mine: AdminProductOptionsDraft, remote: AdminProductOptionsDraft,
    choices: ReadonlyMap<string, ConflictResolutionChoice> = new Map()): readonly OptionConflictEntry[] {
    const b = flatten(base), m = flatten(mine), r = flatten(remote), paths = new Set([...b.keys(), ...m.keys(), ...r.keys()]);
    const conflictPaths = new Set([...paths].filter(path => !Object.is(b.get(path), m.get(path)) && !Object.is(b.get(path), r.get(path)) && !Object.is(m.get(path), r.get(path))));
    const structuralConflicts: string[] = [];
    for (const root of structuralRoots(new Map([...b, ...m, ...r]))) {
      if (structuralConflicts.some(parent => root.startsWith(`${parent}/`))) continue;
      const exists = `${root}/exists`, baseExists = b.get(exists), mineExists = m.get(exists), remoteExists = r.get(exists);
      if (baseExists === true && mineExists === true && remoteExists === undefined && descendantChanged(b, m, root)) { conflictPaths.add(exists); structuralConflicts.push(root); }
      if (baseExists === true && mineExists === undefined && remoteExists === true && descendantChanged(b, r, root)) { conflictPaths.add(exists); structuralConflicts.push(root); }
    }
    return Object.freeze([...conflictPaths].sort().map(path => Object.freeze({ path, label: pathLabel(path), base: display(b.get(path)), mine: display(m.get(path)), remote: display(r.get(path)), choice: choices.get(path) ?? null })));
  }

  static merge(base: AdminProductOptionsDraft, mine: AdminProductOptionsDraft, remote: AdminProductOptionsDraft,
    choices: ReadonlyMap<string, ConflictResolutionChoice>): AdminProductOptionsDraft | null {
    const b = flatten(base), m = flatten(mine), r = flatten(remote), result = new Map<string, FlatValue>();
    const paths = new Set([...b.keys(), ...m.keys(), ...r.keys()]), handled = new Set<string>();
    for (const root of structuralRoots(new Map([...b, ...m, ...r]))) {
      const exists = `${root}/exists`, baseExists = b.get(exists), mineExists = m.get(exists), remoteExists = r.get(exists);
      if (handled.has(exists)) continue;
      const structuralConflict = baseExists === true && mineExists === true && remoteExists === undefined && descendantChanged(b, m, root)
        || baseExists === true && mineExists === undefined && remoteExists === true && descendantChanged(b, r, root);
      if (!structuralConflict) continue;
      const choice = choices.get(exists); if (!choice) return null;
      const source = choice === ConflictResolutionChoice.Mine ? m : r, prefix = `${root}/`;
      for (const path of paths) if (path.startsWith(prefix)) { handled.add(path); const value = source.get(path); if (value !== undefined) result.set(path, value); }
    }
    for (const path of paths) {
      if (handled.has(path)) continue;
      const localChanged = !Object.is(b.get(path), m.get(path)), remoteChanged = !Object.is(b.get(path), r.get(path));
      if (localChanged && remoteChanged && !Object.is(m.get(path), r.get(path))) {
        const choice = choices.get(path); if (!choice) return null;
        const chosen = choice === ConflictResolutionChoice.Mine ? m.get(path) : r.get(path);
        if (chosen !== undefined) result.set(path, chosen); continue;
      }
      const chosen = localChanged ? m.get(path) : r.get(path);
      if (chosen !== undefined) result.set(path, chosen);
    }
    return this.inflate(result);
  }

  private static inflate(flat: Flat): AdminProductOptionsDraft {
    const axisCodes = [...flat.keys()].flatMap(path => /^axis\/([^/]+)\/exists$/.exec(path)?.[1] ?? []);
    const axes = axisCodes.filter(code => flat.get(`axis/${code}/exists`) === true).map(code => {
      const root = `axis/${code}`;
      const valueCodes = [...flat.keys()].flatMap(path => new RegExp(`^axis/${code}/value/([^/]+)/exists$`).exec(path)?.[1] ?? []);
      const presentation = flat.get(`${root}/presentation`) === OptionPresentation.Swatch.wire ? OptionPresentation.Swatch : OptionPresentation.Select;
      return { code, label: String(flat.get(`${root}/label`) ?? ''), presentation, order: Number(flat.get(`${root}/order`) ?? 0),
        values: valueCodes.filter(value => flat.get(`${root}/value/${value}/exists`) === true).map(value => ({ code: value,
          label: String(flat.get(`${root}/value/${value}/label`) ?? ''), swatchColor: String(flat.get(`${root}/value/${value}/color`) ?? ''),
          order: Number(flat.get(`${root}/value/${value}/order`) ?? 0) })).sort((left, right) => left.order - right.order) };
    }).sort((left, right) => left.order - right.order).map((axis, order) => ({ ...axis, order,
      values: axis.values.map((value, valueOrder) => ({ ...value, order: valueOrder })) }));
    const variantIds = [...flat.keys()].flatMap(path => /^variant\/([^/]+)\/exists$/.exec(path)?.[1] ?? []);
    const assignments = variantIds.filter(id => flat.get(`variant/${id}/exists`) === true).map(encodedId => {
      const root = `variant/${encodedId}`, optionValues = new Map<string, string>();
      for (const path of flat.keys()) { const match = new RegExp(`^variant/${encodedId}/option/([^/]+)$`).exec(path);
        if (match) optionValues.set(match[1], String(flat.get(path))); }
      return { variantId: decodeURIComponent(encodedId), variantSku: String(flat.get(`${root}/sku`) ?? ''),
        active: flat.get(`${root}/active`) === true, optionValues: new DomainReadonlyMap(optionValues) };
    });
    const pendingIds = [...flat.keys()].flatMap(path => /^pending\/([^/]+)\/exists$/.exec(path)?.[1] ?? []);
    const pendingAdditions = pendingIds.filter(id => flat.get(`pending/${id}/exists`) === true).map(encodedId => ({ localId: decodeURIComponent(encodedId),
      sku: String(flat.get(`pending/${encodedId}/sku`) ?? ''), label: String(flat.get(`pending/${encodedId}/label`) ?? '') }));
    return Object.freeze({ axes: Object.freeze(axes), assignments: Object.freeze(assignments), pendingAdditions: Object.freeze(pendingAdditions) });
  }
}
