import {
  DomainReadonlyMap, OptionCombination, OptionResolutionCause, OptionSchemaState, OptionSelectionState,
  OptionSnapshot, OptionValueAvailability, VariantOptionAssignment,
} from './option-schema';

/** Facts come from the existing authoritative price/inventory domain, never attributes. */
export interface OptionVariantFacts {
  readonly variantId: string;
  readonly priceKnown: boolean;
  readonly availableQuantity: number | null;
}
export interface OptionSelection {
  readonly state: OptionSelectionState;
  readonly cause: OptionResolutionCause | null;
  readonly values: ReadonlyMap<string, string>;
  readonly variant: VariantOptionAssignment | null;
  readonly quantity: number;
  readonly canPurchase: boolean;
}
export interface OptionValueChoice {
  readonly availability: OptionValueAvailability;
  readonly cause: OptionResolutionCause | null;
}

function matches(variant: VariantOptionAssignment, values: ReadonlyMap<string, string>): boolean {
  return Array.from(values).every(([axis, value]) => variant.values.get(axis) === value);
}

export class ResolveInitialOptionSelectionStep {
  execute(snapshot: OptionSnapshot, sku: string | null): VariantOptionAssignment | null {
    if (sku !== null) return snapshot.variants.find(variant => variant.sku === sku) ?? null;
    return snapshot.schema.state === OptionSchemaState.Absent && snapshot.variants.length === 1
      ? snapshot.variants[0] : null;
  }
}

/** Greedy ordered compatibility retains later independent choices after clearing a gap. */
export class ApplyOptionChoiceStep {
  execute(snapshot: OptionSnapshot, current: ReadonlyMap<string, string>, axisCode: string, valueCode: string): ReadonlyMap<string, string> | null {
    const axisIndex = snapshot.schema.axes.findIndex(axis => axis.code.value === axisCode);
    if (axisIndex < 0 || !snapshot.schema.axes[axisIndex].values.some(value => value.code.value === valueCode)) return null;
    const next = new Map<string, string>();
    for (let index = 0; index < snapshot.schema.axes.length; index++) {
      const code = snapshot.schema.axes[index].code.value;
      const value = index === axisIndex ? valueCode : current.get(code);
      if (value === undefined) continue;
      next.set(code, value);
      if (index > axisIndex && !snapshot.variants.some(variant => matches(variant, next))) next.delete(code);
    }
    return next;
  }
}

export class ResolveVariantFromSelectionStep {
  execute(snapshot: OptionSnapshot, index: ReadonlyMap<string, readonly VariantOptionAssignment[]>, values: ReadonlyMap<string, string>): readonly VariantOptionAssignment[] {
    if (values.size !== snapshot.schema.axes.length) return [];
    return index.get(OptionCombination.key(snapshot.schema.axes, values)) ?? [];
  }
}

/** Pure snapshot engine. No storage, routing, HTTP, framework or purchase-intent effects. */
export class OptionSelectionEngine {
  private readonly combinations = new Map<string, readonly VariantOptionAssignment[]>();
  private readonly facts = new Map<string, OptionVariantFacts>();
  private readonly initial = new ResolveInitialOptionSelectionStep();
  private readonly choice = new ApplyOptionChoiceStep();
  private readonly resolver = new ResolveVariantFromSelectionStep();
  private readonly corrupt: boolean;

  constructor(private readonly snapshot: OptionSnapshot, facts: readonly OptionVariantFacts[]) {
    if (snapshot.schema.state === OptionSchemaState.Valid) {
      for (const variant of snapshot.variants) {
        const key = OptionCombination.key(snapshot.schema.axes, variant.values);
        this.combinations.set(key, [...(this.combinations.get(key) ?? []), variant]);
      }
    }
    for (const fact of facts) this.facts.set(fact.variantId, Object.freeze({ ...fact }));
    this.corrupt = this.facts.size !== facts.length;
  }

  /** Route transitions default to one. Only an exact, independently validated intent supplies quantity. */
  start(sku: string | null, quantity = 1): OptionSelection {
    const variant = this.initial.execute(this.snapshot, sku);
    if (sku !== null && variant === null && (this.snapshot.schema.state === OptionSchemaState.Valid
      || this.snapshot.schema.state === OptionSchemaState.Absent)) {
      return this.result(OptionSelectionState.Unavailable, OptionResolutionCause.NoCombination, new Map(), null, quantity);
    }
    if (this.snapshot.schema.state === OptionSchemaState.Absent) return this.resolveGeneric(variant, quantity);
    return this.resolve(variant?.values ?? new Map(), quantity);
  }

  choose(current: OptionSelection, axisCode: string, valueCode: string): OptionSelection {
    if (this.snapshot.schema.state !== OptionSchemaState.Valid) return this.unknown(current.quantity);
    const values = this.choice.execute(this.snapshot, current.values, axisCode, valueCode);
    return values === null ? this.unknown(current.quantity) : this.resolve(values, current.quantity);
  }

  selectGeneric(sku: string, quantity = 1): OptionSelection {
    if (!this.snapshot.schema.state.allowsGeneric) return this.unknown(quantity);
    return this.start(sku, quantity);
  }

  withQuantity(current: OptionSelection, quantity: number): OptionSelection {
    if (this.snapshot.schema.state !== OptionSchemaState.Absent) return this.resolve(current.values, quantity);
    const variant = current.variant === null ? null : this.snapshot.variants.find(candidate =>
      candidate.variantId === current.variant?.variantId && candidate.sku === current.variant.sku) ?? null;
    return this.resolveGeneric(variant, quantity);
  }

  resolve(values: ReadonlyMap<string, string>, quantity = 1): OptionSelection {
    if (this.corrupt || this.snapshot.schema.state !== OptionSchemaState.Valid) return this.unknown(quantity);
    if (Array.from(values).some(([code, value]) => !this.snapshot.schema.axes.some(axis => axis.code.value === code
      && axis.values.some(option => option.code.value === value)))) return this.unknown(quantity);
    if (values.size < this.snapshot.schema.axes.length) {
      return this.result(OptionSelectionState.Incomplete, OptionResolutionCause.Partial, values, null, quantity);
    }
    const variants = this.resolver.execute(this.snapshot, this.combinations, values);
    if (variants.length > 1) return this.unknown(quantity);
    if (variants.length === 0) return this.result(OptionSelectionState.Unavailable, OptionResolutionCause.NoCombination, values, null, quantity);
    return this.available(variants[0], values, quantity);
  }

  valueChoice(current: OptionSelection, axisCode: string, valueCode: string): OptionValueChoice {
    const axes = this.snapshot.schema.axes;
    const axisIndex = axes.findIndex(axis => axis.code.value === axisCode);
    if (this.corrupt || this.snapshot.schema.state !== OptionSchemaState.Valid || axisIndex < 0
      || !axes[axisIndex].values.some(value => value.code.value === valueCode)) {
      return { availability: OptionValueAvailability.Unknown, cause: OptionResolutionCause.Unknown };
    }
    const prefix = new Map<string, string>();
    for (const axis of axes.slice(0, axisIndex)) {
      const value = current.values.get(axis.code.value);
      if (value !== undefined) prefix.set(axis.code.value, value);
    }
    prefix.set(axisCode, valueCode);
    if (!this.snapshot.variants.some(variant => matches(variant, prefix))) {
      return { availability: OptionValueAvailability.Disabled, cause: OptionResolutionCause.NoCombination };
    }
    return { availability: current.values.get(axisCode) === valueCode ? OptionValueAvailability.Selected : OptionValueAvailability.Selectable, cause: null };
  }

  private resolveGeneric(variant: VariantOptionAssignment | null, quantity: number): OptionSelection {
    if (this.corrupt || !this.snapshot.schema.state.allowsGeneric) return this.unknown(quantity);
    if (variant === null) return this.result(OptionSelectionState.Incomplete, OptionResolutionCause.Partial, new Map(), null, quantity);
    return this.available(variant, new Map(), quantity);
  }

  private available(variant: VariantOptionAssignment, values: ReadonlyMap<string, string>, quantity: number): OptionSelection {
    const fact = this.facts.get(variant.variantId);
    if (fact === undefined) return this.result(OptionSelectionState.Unknown, OptionResolutionCause.Unknown, new Map(), null, quantity);
    if (!fact.priceKnown) return this.result(OptionSelectionState.Unavailable, OptionResolutionCause.PriceUnavailable, values, variant, quantity);
    if (fact.availableQuantity === null || !Number.isSafeInteger(fact.availableQuantity) || fact.availableQuantity < 0) {
      return this.result(OptionSelectionState.Unknown, OptionResolutionCause.Unknown, new Map(), null, quantity);
    }
    if (fact.availableQuantity === 0) return this.result(OptionSelectionState.Unavailable, OptionResolutionCause.OutOfStock, values, variant, quantity);
    return this.result(OptionSelectionState.Complete, null, values, variant, quantity,
      Number.isSafeInteger(quantity) && quantity > 0 && quantity <= fact.availableQuantity);
  }

  private unknown(quantity: number): OptionSelection {
    return this.result(OptionSelectionState.Unknown, this.snapshot.schema.cause ?? OptionResolutionCause.Corrupt, new Map(), null, quantity);
  }

  private result(state: OptionSelectionState, cause: OptionResolutionCause | null, values: ReadonlyMap<string, string>,
    variant: VariantOptionAssignment | null, quantity: number, canPurchase = false): OptionSelection {
    return Object.freeze({ state, cause, values: new DomainReadonlyMap(values), variant, quantity, canPurchase });
  }
}
