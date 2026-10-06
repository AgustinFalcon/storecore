import { AccessContext } from './access-context';
export class AccessHome {
  private constructor(readonly wire: string, readonly route: string | null, readonly context: AccessContext) {}
  static readonly Storefront = new AccessHome('STOREFRONT', '/', AccessContext.Customer);
  static readonly Operations = new AccessHome('OPERATIONS', '/user/home', AccessContext.User);
  static readonly Unknown = new AccessHome('', null, AccessContext.Unknown);
  static fromWire(raw: unknown): AccessHome { return HOMES.get(raw) ?? AccessHome.Unknown; }
  static forContext(context: AccessContext): AccessHome {
    return context === AccessContext.Customer ? AccessHome.Storefront : context === AccessContext.User ? AccessHome.Operations : AccessHome.Unknown;
  }
}
const HOMES = new Map<unknown, AccessHome>([
  [AccessHome.Storefront.wire, AccessHome.Storefront], [AccessHome.Operations.wire, AccessHome.Operations],
]);
