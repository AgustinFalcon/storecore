import { AccessContext } from '../../domain/access/access-context';
import { CustomerProfile } from '../../domain/customer/customer.entity';
import { UserSessionResult } from '../../domain/user/user.entity';
import { UserRole } from '../../domain/user/user-role';

function subjectId(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw
    : typeof raw === 'number' && Number.isSafeInteger(raw) && raw > 0 ? String(raw) : null;
}

/** The single session-probe wire boundary requires a stable actor and understood roles. */
export function mapAccessPrincipal(context: AccessContext, raw: unknown): CustomerProfile | UserSessionResult | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const id = subjectId(row['id']);
  if (!id) return null;
  if (context === AccessContext.Customer) {
    if (typeof row['email'] !== 'string' || !row['email'].trim() || typeof row['firstName'] !== 'string'
      || typeof row['lastName'] !== 'string' || (row['phone'] != null && typeof row['phone'] !== 'string')) return null;
    return { id, email: row['email'], firstName: row['firstName'], lastName: row['lastName'], phone: (row['phone'] as string | null | undefined) ?? '' };
  }
  if (context !== AccessContext.User || !Array.isArray(row['roles'])) return null;
  const roles = row['roles'].map(UserRole.fromWire);
  return roles.length && roles.every(role => role.isKnown) ? { id, roles } : null;
}
