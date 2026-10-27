import { CapabilityModuleState } from './capability-module-state';
import type { CapabilityModule } from './user.entity';

export class CapabilityFilter {
  private constructor(readonly wire: string, readonly label: string, private readonly states: readonly CapabilityModuleState[] | null) {}

  static readonly All = new CapabilityFilter('ALL', 'Todos los estados', null);
  static readonly Active = new CapabilityFilter('ACTIVE', CapabilityModuleState.Active.label, [CapabilityModuleState.Active]);
  static readonly ReadOnly = new CapabilityFilter('READ_ONLY', CapabilityModuleState.ReadOnly.label, [CapabilityModuleState.ReadOnly]);
  static readonly Attention = new CapabilityFilter('ATTENTION', 'Requiere atención', [CapabilityModuleState.Paused, CapabilityModuleState.Error]);
  static readonly Disabled = new CapabilityFilter('DISABLED', CapabilityModuleState.Disabled.label, [CapabilityModuleState.Disabled]);
  static readonly Unknown = new CapabilityFilter('UNKNOWN', CapabilityModuleState.Unknown.label, [CapabilityModuleState.Unknown]);
  static readonly values: readonly CapabilityFilter[] = Object.freeze([
    CapabilityFilter.All, CapabilityFilter.Active, CapabilityFilter.ReadOnly, CapabilityFilter.Attention,
    CapabilityFilter.Disabled, CapabilityFilter.Unknown,
  ]);

  static fromWire(raw: unknown): CapabilityFilter {
    return CapabilityFilter.values.find((filter) => filter.wire === raw) ?? CapabilityFilter.Unknown;
  }

  matches(module: CapabilityModule): boolean { return this.states === null || this.states.includes(module.state); }
}
