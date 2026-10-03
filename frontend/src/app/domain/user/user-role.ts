/** Closed internal roles. Only exact known wire values represent internal identity. */
export class UserRole {
  private constructor(
    readonly wire: string,
    readonly label: string,
    readonly isKnown: boolean,
  ) {}

  static readonly Admin = new UserRole('ADMIN', 'Administrador', true);
  static readonly Operator = new UserRole('OPERATOR', 'Operador', true);
  static readonly Unknown = new UserRole('', 'Rol no reconocido', false);

  static fromWire(raw: unknown): UserRole {
    return KNOWN_ROLES.get(raw) ?? UserRole.Unknown;
  }

  static hasKnownRole(roles: readonly UserRole[]): boolean {
    return roles.some((role) => role.isKnown);
  }
}

const KNOWN_ROLES = new Map<unknown, UserRole>([
  [UserRole.Admin.wire, UserRole.Admin],
  [UserRole.Operator.wire, UserRole.Operator],
]);
