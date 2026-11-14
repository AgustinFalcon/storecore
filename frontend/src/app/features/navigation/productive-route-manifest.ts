import { SurfaceIdentity } from '../../domain/navigation/surface-identity';

export class RouteActor {
  private constructor(readonly wire: string) {}
  static readonly Anonymous = new RouteActor('ANONYMOUS');
  static readonly Customer = new RouteActor('CUSTOMER');
  static readonly Admin = new RouteActor('ADMIN');
  static readonly Unknown = new RouteActor('UNKNOWN');
  static readonly all = [this.Anonymous, this.Customer, this.Admin, this.Unknown] as const;
  static fromWire(raw: unknown): RouteActor {
    return this.all.find(actor => actor.wire === raw) ?? this.Unknown;
  }
}

export class RouteScenario {
  private constructor(readonly wire: string) {}
  static readonly Populated = new RouteScenario('POPULATED');
  static readonly InvalidSecret = new RouteScenario('INVALID_SECRET');
  static readonly Unknown = new RouteScenario('UNKNOWN');
  static readonly all = [this.Populated, this.InvalidSecret, this.Unknown] as const;
  static fromWire(raw: unknown): RouteScenario {
    return this.all.find(scenario => scenario.wire === raw) ?? this.Unknown;
  }
}

export class RouteEvidenceMode {
  private constructor(readonly wire: string) {}
  static readonly HttpFixture = new RouteEvidenceMode('HTTP_FIXTURE');
  static readonly RealBackend = new RouteEvidenceMode('REAL_BACKEND');
  static readonly Unknown = new RouteEvidenceMode('UNKNOWN');
  static readonly all = [this.HttpFixture, this.RealBackend, this.Unknown] as const;
  static fromWire(raw: unknown): RouteEvidenceMode {
    return this.all.find(mode => mode.wire === raw) ?? this.Unknown;
  }
}

export interface ProductiveRouteAcceptance {
  readonly pattern: string;
  readonly url: string;
  readonly surface: SurfaceIdentity;
  readonly actor: RouteActor;
  readonly scenario: RouteScenario;
  readonly heading: string;
  readonly readiness: string;
  readonly evidence: RouteEvidenceMode;
}

const route = (pattern: string, url: string, surface: SurfaceIdentity, actor: RouteActor,
  heading: string, readiness: string, scenario = RouteScenario.Populated): ProductiveRouteAcceptance =>
  ({ pattern, url, surface, actor, scenario, heading, readiness, evidence: RouteEvidenceMode.HttpFixture });

export const productiveRouteManifest: readonly ProductiveRouteAcceptance[] = [
  route('', '/', SurfaceIdentity.Home, RouteActor.Anonymous, 'Inicio', 'text=Portada de ruta'),
  route('login', '/login', SurfaceIdentity.Login, RouteActor.Anonymous, 'Ingresar', '#login-title'),
  route('recover', '/recover', SurfaceIdentity.Recovery, RouteActor.Anonymous, 'Recuperar acceso', '#recovery-title'),
  route('reset-password', '/reset-password#realm=customer&token=invalid', SurfaceIdentity.Recovery, RouteActor.Anonymous, 'Nueva contraseña', '#recovery-title', RouteScenario.InvalidSecret),
  route('verify-email', '/verify-email#realm=customer&token=invalid', SurfaceIdentity.EmailVerification, RouteActor.Anonymous, 'Verificar mi correo', '#verify-title', RouteScenario.InvalidSecret),
  route('catalog', '/catalog', SurfaceIdentity.Catalog, RouteActor.Anonymous, 'Catálogo', 'text=Taladro de ruta'),
  route('catalog/:sku', '/catalog/ROUTE-SKU-1', SurfaceIdentity.Product, RouteActor.Anonymous, 'Taladro de ruta', 'text=Taladro de ruta'),
  route('cart', '/cart', SurfaceIdentity.Cart, RouteActor.Customer, 'Carrito', 'text=ROUTE-SKU-1'),
  route('checkout', '/checkout', SurfaceIdentity.Checkout, RouteActor.Customer, 'Checkout', 'text=Taladro de ruta'),
  route('checkout/result/:orderId', '/checkout/result/ROUTE-ORDER-1', SurfaceIdentity.Result, RouteActor.Customer, 'Pedido iniciado', 'text=ROUTE-ORDER-1'),
  route('customer/register', '/customer/register', SurfaceIdentity.Registration, RouteActor.Anonymous, 'Crear cuenta customer', '#register-title'),
  route('customer/profile', '/customer/profile', SurfaceIdentity.Profile, RouteActor.Customer, 'Perfil customer', 'input[name="profileEmail"]'),
  route('customer/addresses', '/customer/addresses', SurfaceIdentity.Addresses, RouteActor.Customer, 'Direcciones', 'text=Calle de ruta'),
  route('customer/favorites', '/customer/favorites', SurfaceIdentity.Favorites, RouteActor.Customer, 'Tus favoritos', 'text=ROUTE-SKU-1'),
  route('customer/orders', '/customer/orders', SurfaceIdentity.Orders, RouteActor.Customer, 'Mis órdenes', 'text=ROUTE-ORDER-1'),
  route('customer/orders/:id', '/customer/orders/ROUTE-ORDER-1', SurfaceIdentity.Order, RouteActor.Customer, 'Orden ROUTE-ORDER-1', 'text=Taladro de ruta'),
  route('user/account', '/user/account', SurfaceIdentity.UserAccount, RouteActor.Admin, 'Mi cuenta', '#account-title'),
  route('user/home', '/user/home', SurfaceIdentity.Overview, RouteActor.Admin, 'Resumen operativo', 'text=Taladro de ruta'),
  route('user/content', '/user/content', SurfaceIdentity.Content, RouteActor.Admin, 'Diseñá tu inicio', 'text=Portada de ruta'),
  route('user/catalog', '/user/catalog', SurfaceIdentity.AdminCatalog, RouteActor.Admin, 'Catálogo operador', 'text=Taladro de ruta'),
  route('user/offers', '/user/offers', SurfaceIdentity.Offers, RouteActor.Admin, 'Ofertas locales', 'text=ROUTE-SKU-1'),
  route('user/customers', '/user/customers', SurfaceIdentity.Customers, RouteActor.Admin, 'Clientes', 'text=route.customer@example.test'),
  route('user/promos', '/user/promos', SurfaceIdentity.Campaigns, RouteActor.Admin, 'Políticas de precio manual', 'text=ROUTE-SKU-1'),
  route('user/orders', '/user/orders', SurfaceIdentity.AdminOrders, RouteActor.Admin, 'Fulfillment', 'text=ROUTE-ORDER-1'),
  route('user/orders/:id', '/user/orders/ROUTE-ORDER-1', SurfaceIdentity.AdminOrder, RouteActor.Admin, 'Fulfillment ROUTE-ORDER-1', 'text=Taladro de ruta'),
  route('user/inventory', '/user/inventory', SurfaceIdentity.Inventory, RouteActor.Admin, 'Inventario WEB', 'text=ROUTE-SKU-1'),
  route('user/mercadolibre', '/user/mercadolibre', SurfaceIdentity.MercadoLibre, RouteActor.Admin, 'Mercado Libre', 'text=ROUTE-ML-1'),
  route('user/capabilities', '/user/capabilities', SurfaceIdentity.Capabilities, RouteActor.Admin, 'Módulos del comercio', 'text=Preparación y entregas'),
  route('user/profile-import', '/user/profile-import', SurfaceIdentity.Configuration, RouteActor.Admin, 'Importar perfil', '#import-title'),
];

export const productiveRedirectManifest = new Map<string, string>([
  ['customer/', '/login'],
  ['customer/session', 'redirect-function'],
  ['user/', 'home'],
  ['user/session', 'redirect-function'],
]);

export const productiveWildcardManifest = ['**', 'customer/**', 'user/**'] as const;
