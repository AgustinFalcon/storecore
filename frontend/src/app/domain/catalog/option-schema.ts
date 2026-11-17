/** Closed domain cases. Only OptionWireMapper translates transport values. */
export const OPTION_MAX_WIRE_INTEGER = 2_147_483_647;

export class OptionPresentation {
  private constructor(readonly wire: 'SELECT' | 'SWATCH' | 'UNKNOWN', readonly label: string) {}
  static readonly Select = Object.freeze(new OptionPresentation('SELECT', 'Lista'));
  static readonly Swatch = Object.freeze(new OptionPresentation('SWATCH', 'Muestras'));
  static readonly Unknown = Object.freeze(new OptionPresentation('UNKNOWN', 'Presentación no disponible'));
  get usesColor(): boolean { return this === OptionPresentation.Swatch; }
}

export class OptionSchemaState {
  private constructor(readonly wire: 'ABSENT' | 'VALID' | 'INVALID' | 'UNKNOWN', readonly label: string, readonly allowsGeneric: boolean) {}
  static readonly Absent = Object.freeze(new OptionSchemaState('ABSENT', 'Sin opciones configuradas', true));
  static readonly Valid = Object.freeze(new OptionSchemaState('VALID', 'Opciones configuradas', false));
  static readonly Invalid = Object.freeze(new OptionSchemaState('INVALID', 'Opciones inválidas', false));
  static readonly Unknown = Object.freeze(new OptionSchemaState('UNKNOWN', 'Opciones no disponibles', false));
}

export class OptionSelectionState {
  private constructor(readonly wire: 'COMPLETE' | 'INCOMPLETE' | 'UNAVAILABLE' | 'UNKNOWN', readonly label: string) {}
  static readonly Complete = Object.freeze(new OptionSelectionState('COMPLETE', 'Selección completa'));
  static readonly Incomplete = Object.freeze(new OptionSelectionState('INCOMPLETE', 'Elegí las opciones restantes'));
  static readonly Unavailable = Object.freeze(new OptionSelectionState('UNAVAILABLE', 'Selección no disponible'));
  static readonly Unknown = Object.freeze(new OptionSelectionState('UNKNOWN', 'No se puede verificar la selección'));
}

export class OptionValueAvailability {
  private constructor(readonly wire: 'SELECTABLE' | 'SELECTED' | 'DISABLED' | 'UNKNOWN', readonly label: string, readonly enabled: boolean) {}
  static readonly Selectable = Object.freeze(new OptionValueAvailability('SELECTABLE', 'Disponible', true));
  static readonly Selected = Object.freeze(new OptionValueAvailability('SELECTED', 'Seleccionado', true));
  static readonly Disabled = Object.freeze(new OptionValueAvailability('DISABLED', 'Sin variante compatible', false));
  static readonly Unknown = Object.freeze(new OptionValueAvailability('UNKNOWN', 'Disponibilidad no verificada', false));
}

export class OptionResolutionCause {
  private constructor(readonly wire: 'PARTIAL' | 'NO_COMBINATION' | 'OUT_OF_STOCK' | 'PRICE_UNAVAILABLE' | 'CORRUPT' | 'UNKNOWN', readonly label: string) {}
  static readonly Partial = Object.freeze(new OptionResolutionCause('PARTIAL', 'Elegí las opciones restantes'));
  static readonly NoCombination = Object.freeze(new OptionResolutionCause('NO_COMBINATION', 'No existe esa combinación'));
  static readonly OutOfStock = Object.freeze(new OptionResolutionCause('OUT_OF_STOCK', 'Sin stock'));
  static readonly PriceUnavailable = Object.freeze(new OptionResolutionCause('PRICE_UNAVAILABLE', 'Precio no disponible'));
  static readonly Corrupt = Object.freeze(new OptionResolutionCause('CORRUPT', 'Opciones inconsistentes'));
  static readonly Unknown = Object.freeze(new OptionResolutionCause('UNKNOWN', 'Disponibilidad no verificada'));
}

export class OptionCode {
  private constructor(readonly value: string) {}
  static create(value: string): OptionCode {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value)) throw new Error('Código de opción inválido');
    return Object.freeze(new OptionCode(value));
  }
}

export class OptionLabel {
  private constructor(readonly value: string, readonly comparisonKey: string) {}
  static create(value: string): OptionLabel {
    if (/[\p{Cc}\p{Cf}]/u.test(value)) throw new Error('Etiqueta de opción inválida');
    const normalized = value.trim().replace(/\s+/gu, ' ');
    if (Array.from(normalized).length < 1 || Array.from(normalized).length > 80) throw new Error('Etiqueta de opción inválida');
    const key = Array.from(normalized.normalize('NFKC'), character => {
      if (character === '\u00df' || character === '\u1e9e') return 'ss';
      return character === '\u0131' ? character : character.toUpperCase().toLowerCase();
    }).join('');
    return Object.freeze(new OptionLabel(normalized, key));
  }
}

export class SwatchColor {
  private constructor(readonly value: string) {}
  static create(value: string): SwatchColor {
    if (!/^#[0-9a-f]{6}$/.test(value)) throw new Error('Muestra inválida');
    return Object.freeze(new SwatchColor(value));
  }
}

export class SchemaRevision {
  private constructor(readonly value: number) {}
  static create(value: number): SchemaRevision {
    if (!Number.isSafeInteger(value) || value < 1 || value > OPTION_MAX_WIRE_INTEGER) throw new Error('Revisión inválida');
    return Object.freeze(new SchemaRevision(value));
  }
}

export interface OptionValue {
  readonly code: OptionCode;
  readonly label: OptionLabel;
  readonly order: number;
  readonly swatchColor: SwatchColor | null;
}
export interface OptionAxis {
  readonly code: OptionCode;
  readonly label: OptionLabel;
  readonly presentation: OptionPresentation;
  readonly order: number;
  readonly values: readonly OptionValue[];
}
export interface ProductOptionSchema {
  readonly revision: SchemaRevision | null;
  readonly state: OptionSchemaState;
  readonly cause: OptionResolutionCause | null;
  readonly axes: readonly OptionAxis[];
}
export interface VariantOptionAssignment {
  readonly variantId: string;
  readonly sku: string;
  readonly values: ReadonlyMap<string, string>;
}
export interface OptionSnapshot {
  readonly schema: ProductOptionSchema;
  readonly variants: readonly VariantOptionAssignment[];
}

/** Runtime-immutable map used by domain snapshots exposed to stores and views. */
export class DomainReadonlyMap<K, V> implements ReadonlyMap<K, V> {
  readonly #values: Map<K, V>;

  constructor(values: ReadonlyMap<K, V> | readonly (readonly [K, V])[]) {
    this.#values = new Map(values as Iterable<readonly [K, V]>);
    Object.freeze(this);
  }

  get size(): number { return this.#values.size; }
  get(key: K): V | undefined { return this.#values.get(key); }
  has(key: K): boolean { return this.#values.has(key); }
  entries(): MapIterator<[K, V]> { return this.#values.entries(); }
  keys(): MapIterator<K> { return this.#values.keys(); }
  values(): MapIterator<V> { return this.#values.values(); }
  [Symbol.iterator](): MapIterator<[K, V]> { return this.#values[Symbol.iterator](); }
  forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void {
    this.#values.forEach((value, key) => callbackfn.call(thisArg, value, key, this));
  }
}

/** Structured vectors avoid ambiguous delimiters in identities. */
export class OptionCombination {
  static key(axes: readonly OptionAxis[], values: ReadonlyMap<string, string>): string {
    return JSON.stringify(axes.map(axis => [axis.code.value, values.get(axis.code.value)]));
  }
}
