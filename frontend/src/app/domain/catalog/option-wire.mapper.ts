import {
  DomainReadonlyMap, OPTION_MAX_WIRE_INTEGER, OptionAxis, OptionCode, OptionCombination, OptionLabel, OptionPresentation,
  OptionResolutionCause, OptionSchemaState, OptionSnapshot, OptionValue,
  ProductOptionSchema, SchemaRevision, SwatchColor, VariantOptionAssignment,
} from './option-schema';

/** Additive option wire only; commercial price/stock facts remain in their existing domain. */
export interface OptionVariantWire {
  readonly id: unknown;
  readonly sku: unknown;
  readonly optionValues?: unknown;
}
export interface AdminOptionVariantWire extends OptionVariantWire { readonly active: unknown; }

export interface OptionValueWire {
  readonly code: string;
  readonly label: string;
  readonly order: number;
  readonly swatchColor?: string | null;
}
export interface OptionAxisWire {
  readonly code: string;
  readonly label: string;
  readonly presentation: OptionPresentation['wire'];
  readonly order: number;
  readonly values: readonly OptionValueWire[];
}
export interface OptionSchemaWire {
  readonly revision: number;
  readonly state: Exclude<OptionSchemaState['wire'], 'INVALID'>;
  readonly cause: OptionResolutionCause['wire'] | null;
  readonly axes: readonly OptionAxisWire[];
}

function record(raw: unknown): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Objeto inválido');
  return raw as Record<string, unknown>;
}
function field(row: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(row, key) ? row[key] : undefined;
}
function string(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('Texto inválido');
  return raw;
}
function order(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0 || raw > OPTION_MAX_WIRE_INTEGER) throw new Error('Orden inválido');
  return raw;
}
function list(raw: unknown, maximum: number, minimum = 0): unknown[] {
  if (!Array.isArray(raw) || raw.length < minimum || raw.length > maximum) throw new Error('Límite inválido');
  return raw;
}
function unique<T>(rows: readonly T[], key: (row: T) => unknown): void {
  if (new Set(rows.map(key)).size !== rows.length) throw new Error('Identidad duplicada');
}

/** One fail-closed boundary, with normalization and assignment validation as independent steps. */
export class OptionWireMapper {
  static fromWire(raw: unknown, variants: readonly OptionVariantWire[]): OptionSnapshot {
    try {
      const schema = new NormalizeOptionSchemaStep().execute(raw);
      const assignments = new ValidateVariantAssignmentsStep().execute(schema, variants);
      return Object.freeze({ schema, variants: assignments });
    } catch {
      return Object.freeze({ schema: Object.freeze({ revision: null, state: OptionSchemaState.Unknown,
        cause: OptionResolutionCause.Corrupt, axes: Object.freeze([]) }), variants: Object.freeze([]) });
    }
  }

  static fromAdminWire(raw: unknown, variants: readonly AdminOptionVariantWire[]): OptionSnapshot {
    try {
      const schema = new NormalizeOptionSchemaStep().execute(raw);
      const assignments = new ValidateAdminVariantAssignmentsStep().execute(schema, variants);
      return Object.freeze({ schema, variants: assignments });
    } catch {
      return Object.freeze({ schema: Object.freeze({ revision: null, state: OptionSchemaState.Unknown,
        cause: OptionResolutionCause.Corrupt, axes: Object.freeze([]) }), variants: Object.freeze([]) });
    }
  }
}

export class NormalizeOptionSchemaStep {
  execute(raw: unknown): ProductOptionSchema {
    const row = record(raw);
    const revision = SchemaRevision.create(field(row, 'revision') as number);
    const state = field(row, 'state');
    if (state === OptionSchemaState.Absent.wire) {
      if (field(row, 'cause') !== null || list(field(row, 'axes'), 4).length !== 0) throw new Error('Ausencia inconsistente');
      return Object.freeze({ revision, state: OptionSchemaState.Absent, cause: null, axes: Object.freeze([]) });
    }
    if (state !== OptionSchemaState.Valid.wire) {
      const cause = [OptionResolutionCause.Partial, OptionResolutionCause.NoCombination, OptionResolutionCause.OutOfStock,
        OptionResolutionCause.PriceUnavailable, OptionResolutionCause.Corrupt].find(cause => cause.wire === field(row, 'cause'))
        ?? OptionResolutionCause.Unknown;
      return Object.freeze({ revision, state: OptionSchemaState.Unknown, cause, axes: Object.freeze([]) });
    }
    if (field(row, 'cause') !== null) throw new Error('Causa inconsistente');
    const axes = list(field(row, 'axes'), 4, 1).map(rawAxis => this.axis(rawAxis));
    unique(axes, axis => axis.code.value);
    unique(axes, axis => axis.label.comparisonKey);
    unique(axes, axis => axis.order);
    return Object.freeze({ revision, state: OptionSchemaState.Valid, cause: null,
      axes: Object.freeze(axes.sort((a, b) => a.order - b.order)) });
  }

  private axis(raw: unknown): OptionAxis {
    const row = record(raw);
    const presentation = [OptionPresentation.Select, OptionPresentation.Swatch]
      .find(value => value.wire === field(row, 'presentation'));
    if (!presentation) throw new Error('Presentación desconocida');
    const values = list(field(row, 'values'), 50, 1).map(rawValue => {
      const value = record(rawValue), swatch = field(value, 'swatchColor');
      if (swatch != null && presentation !== OptionPresentation.Swatch) throw new Error('Muestra en presentación inválida');
      return Object.freeze({ code: OptionCode.create(string(field(value, 'code'))), label: OptionLabel.create(string(field(value, 'label'))),
        order: order(field(value, 'order')), swatchColor: swatch == null ? null : SwatchColor.create(string(swatch)) }) satisfies OptionValue;
    });
    unique(values, value => value.code.value);
    unique(values, value => value.label.comparisonKey);
    unique(values, value => value.order);
    return Object.freeze({ code: OptionCode.create(string(field(row, 'code'))), label: OptionLabel.create(string(field(row, 'label'))),
      order: order(field(row, 'order')), presentation, values: Object.freeze(values.sort((a, b) => a.order - b.order)) });
  }
}

export class ValidateVariantAssignmentsStep {
  execute(schema: ProductOptionSchema, raw: readonly OptionVariantWire[]): readonly VariantOptionAssignment[] {
    if (raw.length > 1000) throw new Error('Demasiadas variantes');
    const variants = raw.map(value => {
      const row = record(value);
      const variantId = string(field(row, 'id')), sku = string(field(row, 'sku'));
      if (!variantId.trim() || !sku.trim()) throw new Error('Identidad vacía');
      const values = new Map<string, string>();
      const supplied = field(row, 'optionValues');
      if (supplied != null) {
        const entries = Object.entries(record(supplied));
        if (entries.length > 4) throw new Error('Demasiadas asignaciones');
        for (const [axis, value] of entries) values.set(OptionCode.create(axis).value, OptionCode.create(string(value)).value);
      }
      if (schema.state === OptionSchemaState.Absent && values.size !== 0) throw new Error('Asignaciones sin schema');
      if (schema.state === OptionSchemaState.Valid && (values.size !== schema.axes.length || schema.axes.some(axis =>
        !axis.values.some(value => value.code.value === values.get(axis.code.value))))) throw new Error('Asignación incompleta');
      return Object.freeze({ variantId, sku, values: new DomainReadonlyMap(values) });
    });
    unique(variants, variant => variant.variantId);
    unique(variants, variant => variant.sku);
    if (schema.state === OptionSchemaState.Valid) unique(variants, variant => OptionCombination.key(schema.axes, variant.values));
    return Object.freeze(variants);
  }
}

export class ValidateAdminVariantAssignmentsStep {
  execute(schema: ProductOptionSchema, raw: readonly AdminOptionVariantWire[]): readonly VariantOptionAssignment[] {
    if (raw.length > 1000) throw new Error('Demasiadas variantes');
    const parsed = raw.map(value => {
      const row = record(value), active = field(row, 'active');
      if (typeof active !== 'boolean') throw new Error('Actividad inválida');
      const variantId = string(field(row, 'id')), sku = string(field(row, 'sku'));
      if (!variantId.trim() || !sku.trim()) throw new Error('Identidad vacía');
      const values = new Map<string, string>(), supplied = field(row, 'optionValues');
      if (supplied != null) {
        const entries = Object.entries(record(supplied));
        if (entries.length > 4) throw new Error('Demasiadas asignaciones');
        for (const [axis, rawValue] of entries) values.set(OptionCode.create(axis).value, OptionCode.create(string(rawValue)).value);
      }
      if (schema.state === OptionSchemaState.Absent && values.size !== 0) throw new Error('Asignaciones sin schema');
      const valuesValid = [...values].every(([axisCode, valueCode]) => schema.axes.some(axis => axis.code.value === axisCode
        && axis.values.some(option => option.code.value === valueCode)));
      if (schema.state === OptionSchemaState.Valid && (!valuesValid || active && (values.size !== schema.axes.length
        || schema.axes.some(axis => !values.has(axis.code.value))))) throw new Error('Asignación administrativa inválida');
      return { active, assignment: Object.freeze({ variantId, sku, values: new DomainReadonlyMap(values) }) };
    });
    unique(parsed, row => row.assignment.variantId); unique(parsed, row => row.assignment.sku);
    if (schema.state === OptionSchemaState.Valid) unique(parsed.filter(row => row.active), row => OptionCombination.key(schema.axes, row.assignment.values));
    return Object.freeze(parsed.map(row => row.assignment));
  }
}
