export interface DemoReturnTarget { readonly kind: DemoReturnDestination; readonly url: string; }

/** The only wire translator for recovery/login return targets. */
export class DemoReturnDestination {
  private constructor(private readonly path: RegExp) {}
  static readonly Home = new DemoReturnDestination(/^\/demo$/);
  static readonly Catalog = new DemoReturnDestination(/^\/demo\/catalog$/);
  static readonly Product = new DemoReturnDestination(/^\/demo\/catalog\/[^/]+$/);
  static readonly Cart = new DemoReturnDestination(/^\/demo\/cart$/);
  static readonly Checkout = new DemoReturnDestination(/^\/demo\/checkout$/);
  static readonly Profile = new DemoReturnDestination(/^\/demo\/customer\/profile$/);
  static readonly Addresses = new DemoReturnDestination(/^\/demo\/customer\/addresses$/);
  static readonly Favorites = new DemoReturnDestination(/^\/demo\/customer\/favorites$/);
  static readonly Orders = new DemoReturnDestination(/^\/demo\/customer\/orders$/);
  static readonly Order = new DemoReturnDestination(/^\/demo\/customer\/orders\/[^/]+$/);
  static readonly Unknown = new DemoReturnDestination(/$a/);
  static readonly all = [this.Home, this.Catalog, this.Product, this.Cart, this.Checkout, this.Profile, this.Addresses, this.Favorites, this.Orders, this.Order] as const;

  static fromWire(raw: unknown): DemoReturnTarget {
    const invalid = { kind: this.Unknown, url: '/demo' };
    if (typeof raw !== 'string' || raw.length > 2048 || !raw.startsWith('/demo') || /[\\\s]/.test(raw)) return invalid;
    const rawPath = raw.split(/[?#]/, 1)[0];
    // Validate before URL normalizes encoded dot segments into another route.
    if (/[% ;]/.test(rawPath) || rawPath.split('/').some(part => part === '.' || part === '..')) return invalid;
    try {
      const parsed = new URL(raw, 'https://storecore.demo.invalid');
      // Reject encoded path syntax; query values may carry encoded purchase intent.
      if (parsed.origin !== 'https://storecore.demo.invalid') return invalid;
      const kind = this.all.find(target => target.path.test(parsed.pathname));
      return kind ? { kind, url: `${parsed.pathname}${parsed.search}${parsed.hash}` } : invalid;
    } catch { return invalid; }
  }
}
