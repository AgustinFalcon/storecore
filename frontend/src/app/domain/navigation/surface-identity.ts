export class SurfaceTarget {
  private constructor(readonly wire: string, readonly data: string, readonly prefix: string) {}
  static readonly Demo = new SurfaceTarget('Demo', 'simulated', '/demo');
  static readonly Real = new SurfaceTarget('Real', 'http', '');
  static readonly Unknown = new SurfaceTarget('Unknown', 'unavailable', '');
  static fromWire(raw: unknown): SurfaceTarget {
    return [this.Demo, this.Real].find(target => target.wire === raw) ?? this.Unknown;
  }
}

/** Identity belongs to the matched route host, never to a heading or requested URL. */
export class SurfaceIdentity {
  private constructor(readonly wire: string, readonly path: string, readonly real = true) {}
  static readonly Home = new SurfaceIdentity('SC-SURF-01', '');
  static readonly Login = new SurfaceIdentity('SC-SURF-02', 'login');
  static readonly Recovery = new SurfaceIdentity('SC-SURF-03', 'recover');
  static readonly Catalog = new SurfaceIdentity('SC-SURF-04', 'catalog');
  static readonly Product = new SurfaceIdentity('SC-SURF-05', 'catalog/:sku');
  static readonly Registration = new SurfaceIdentity('SC-SURF-06', 'customer/register');
  static readonly Profile = new SurfaceIdentity('SC-SURF-07', 'customer/profile');
  static readonly Addresses = new SurfaceIdentity('SC-SURF-08', 'customer/addresses');
  static readonly Favorites = new SurfaceIdentity('SC-SURF-09', 'customer/favorites');
  static readonly Cart = new SurfaceIdentity('SC-SURF-10', 'cart');
  static readonly Checkout = new SurfaceIdentity('SC-SURF-11', 'checkout');
  static readonly Result = new SurfaceIdentity('SC-SURF-12', 'checkout/result/:orderId');
  static readonly Orders = new SurfaceIdentity('SC-SURF-13', 'customer/orders');
  static readonly Order = new SurfaceIdentity('SC-SURF-14', 'customer/orders/:id');
  static readonly Overview = new SurfaceIdentity('SC-SURF-15', 'user/home');
  static readonly Content = new SurfaceIdentity('SC-SURF-16', 'user/content');
  static readonly AdminCatalog = new SurfaceIdentity('SC-SURF-17', 'user/catalog');
  static readonly Offers = new SurfaceIdentity('SC-SURF-18', 'user/offers');
  static readonly Campaigns = new SurfaceIdentity('SC-SURF-19', 'user/promos');
  static readonly AdminOrders = new SurfaceIdentity('SC-SURF-20', 'user/orders');
  static readonly AdminOrder = new SurfaceIdentity('SC-SURF-21', 'user/orders/:id');
  static readonly Inventory = new SurfaceIdentity('SC-SURF-22', 'user/inventory');
  static readonly MercadoLibre = new SurfaceIdentity('SC-SURF-23', 'user/mercadolibre');
  static readonly Capabilities = new SurfaceIdentity('SC-SURF-24', 'user/capabilities');
  static readonly Configuration = new SurfaceIdentity('SC-SURF-25', 'user/profile-import');
  static readonly Customers = new SurfaceIdentity('SC-SURF-26', 'user/customers');
  static readonly Unknown = new SurfaceIdentity('NOT-FOUND', '**', false);
  static readonly all: readonly SurfaceIdentity[] = [this.Home, this.Login, this.Recovery, this.Catalog, this.Product, this.Registration, this.Profile, this.Addresses, this.Favorites, this.Cart, this.Checkout, this.Result, this.Orders, this.Order, this.Overview, this.Content, this.AdminCatalog, this.Offers, this.Campaigns, this.AdminOrders, this.AdminOrder, this.Inventory, this.MercadoLibre, this.Capabilities, this.Configuration, this.Customers];
  static fromWire(raw: unknown): SurfaceIdentity { return this.all.find(surface => surface.wire === raw) ?? this.Unknown; }
  availableOn(target: SurfaceTarget): boolean { return this !== SurfaceIdentity.Unknown && (target === SurfaceTarget.Demo || target === SurfaceTarget.Real && this.real); }
  static fromMatchedPath(path: string, target: SurfaceTarget): SurfaceIdentity {
    if (path === 'reset-password' && target === SurfaceTarget.Real) return this.Recovery;
    return this.all.find(surface => surface.path === path && surface.availableOn(target)) ?? this.Unknown;
  }
}

export class NotFoundRecovery {
  private constructor(readonly wire: string, readonly path: string, readonly label: string) {}
  static readonly Customer = new NotFoundRecovery('customer', '/customer/orders', 'Ir a mis pedidos');
  static readonly User = new NotFoundRecovery('user', '/user/home', 'Ir a administración');
  static readonly Unknown = new NotFoundRecovery('', '/catalog', 'Explorar el catálogo');
  static fromWire(raw: unknown): NotFoundRecovery {
    return [this.Customer, this.User].find(recovery => recovery.wire === raw) ?? this.Unknown;
  }
}
