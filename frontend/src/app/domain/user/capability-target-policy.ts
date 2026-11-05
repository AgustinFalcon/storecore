import { UserRole } from './user-role';

export class CapabilityTargetPolicy {
  private constructor(readonly wire: string, readonly allowsMutation: boolean, private readonly roles: readonly UserRole[]) {}

  static readonly RealReadOnly = new CapabilityTargetPolicy('REAL_READ_ONLY', false, [UserRole.Admin, UserRole.Operator]);
  static readonly Unknown = new CapabilityTargetPolicy('UNKNOWN', false, []);

  static fromWire(raw: unknown): CapabilityTargetPolicy {
    return raw === CapabilityTargetPolicy.RealReadOnly.wire ? CapabilityTargetPolicy.RealReadOnly : CapabilityTargetPolicy.Unknown;
  }

  permits(roles: readonly UserRole[]): boolean { return this.roles.some((role) => roles.includes(role)); }
}
