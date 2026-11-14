import { CapabilityModuleId } from './capability-module-id';
import { CapabilityModuleState } from './capability-module-state';
import { CapabilityModule } from './user.entity';

export class CapabilityStateIntent {
  static readonly Unknown = new CapabilityStateIntent(CapabilityModuleId.Unknown, CapabilityModuleState.Unknown, CapabilityModuleState.Unknown, 0, '', '');
  private constructor(readonly module: CapabilityModuleId, readonly current: CapabilityModuleState,
    readonly target: CapabilityModuleState, readonly expectedConfigVersion: number,
    readonly reason: string, readonly correlationId: string) { Object.freeze(this); }

  static canEdit(row: CapabilityModule): boolean {
    return row.id !== CapabilityModuleId.Unknown && row.state !== CapabilityModuleState.Unknown
      && row.configVersion !== null && Number.isSafeInteger(row.configVersion) && row.configVersion > 0;
  }
  static isValid(row: CapabilityModule, target: CapabilityModuleState, reason: string): boolean {
    return this.canEdit(row) && row.state.allowedTargets.includes(target) && reason.trim().length > 0 && reason.trim().length <= 500;
  }
  static create(row: CapabilityModule, target: CapabilityModuleState, reason: string, uuid: () => string): CapabilityStateIntent | null {
    if (!this.isValid(row, target, reason)) return null;
    const correlation = uuid();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(correlation)) return null;
    return new CapabilityStateIntent(row.id, row.state, target, row.configVersion!, reason.trim(), correlation);
  }
  static fromWire(raw: unknown): CapabilityStateIntent {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return this.Unknown;
    const wire = raw as Record<string, unknown>;
    if (Object.keys(wire).sort().join(',') !== 'correlationId,current,expectedConfigVersion,module,reason,target'
      || typeof wire['reason'] !== 'string' || wire['reason'] !== wire['reason'].trim()
      || typeof wire['correlationId'] !== 'string' || typeof wire['expectedConfigVersion'] !== 'number') return this.Unknown;
    return this.create({ id: CapabilityModuleId.fromWire(wire['module']), state: CapabilityModuleState.fromWire(wire['current']),
      configVersion: wire['expectedConfigVersion'] }, CapabilityModuleState.fromWire(wire['target']), wire['reason'], () => wire['correlationId'] as string) ?? this.Unknown;
  }
  toWire(): Readonly<Record<string, unknown>> {
    if (this === CapabilityStateIntent.Unknown) throw new Error('Intento no reconocido.');
    return { module: this.module.wire, current: this.current.wire, target: this.target.wire,
      expectedConfigVersion: this.expectedConfigVersion, reason: this.reason, correlationId: this.correlationId };
  }
  accepts(row: CapabilityModule): boolean { return row.id === this.module && row.state !== CapabilityModuleState.Unknown && row.configVersion === this.expectedConfigVersion + 1 && row.state === this.target; }
}
