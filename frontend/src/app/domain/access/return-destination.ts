import { AccessContext } from './access-context';
import { AccessHome } from './access-home';
export class ReturnDestination {
  private constructor(readonly wire: string, private readonly path: string | null, private readonly context: AccessContext | null) {}
  static readonly Home = new ReturnDestination('HOME', null, null);
  static readonly Catalog = new ReturnDestination('CATALOG', '/catalog', null);
  static readonly CustomerProfile = new ReturnDestination('CUSTOMER_PROFILE', '/customer/profile', AccessContext.Customer);
  static readonly CustomerOrders = new ReturnDestination('CUSTOMER_ORDERS', '/customer/orders', AccessContext.Customer);
  static readonly UserOrders = new ReturnDestination('USER_ORDERS', '/user/orders', AccessContext.User);
  static readonly Unknown = new ReturnDestination('', null, AccessContext.Unknown);
  static fromWire(raw: unknown): ReturnDestination { return DESTINATIONS.get(raw) ?? ReturnDestination.Unknown; }
  /** Only exact v1 routes survive the browser boundary; arbitrary query/encoding input never does. */
  static fromPath(raw: unknown): ReturnDestination { return PATHS.get(raw) ?? ReturnDestination.Unknown; }
  permits(context: AccessContext): boolean {
    return this !== ReturnDestination.Unknown && context.isKnown && (this.context === null || this.context === context);
  }
  routeFor(context: AccessContext): string | null {
    if (!this.permits(context)) return null;
    return this.path ?? AccessHome.forContext(context).route;
  }
}
const KNOWN = [ReturnDestination.Home, ReturnDestination.Catalog, ReturnDestination.CustomerProfile, ReturnDestination.CustomerOrders, ReturnDestination.UserOrders];
const DESTINATIONS = new Map<unknown, ReturnDestination>(KNOWN.map((destination) => [destination.wire, destination]));
const PATHS = new Map<unknown, ReturnDestination>([
  ['/', ReturnDestination.Home], ['/user', ReturnDestination.Home], ['/user/home', ReturnDestination.Home],
  ['/catalog', ReturnDestination.Catalog], ['/customer/profile', ReturnDestination.CustomerProfile],
  ['/customer/orders', ReturnDestination.CustomerOrders], ['/user/orders', ReturnDestination.UserOrders],
]);
