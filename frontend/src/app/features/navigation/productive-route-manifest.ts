import { SurfaceIdentity } from '../../domain/navigation/surface-identity';

import { RouteActor, RouteScenario, RouteEvidenceMode, RouteActionClass } from './route-evidence';
import { RealRouteReceipt } from './real-fixture-receipt';
export { RouteActor, RouteScenario, RouteEvidenceMode, RouteActionClass, RouteGateResult } from './route-evidence';

export interface ProductiveRouteDefinition {
  readonly pattern: string;
  readonly surface: SurfaceIdentity;
  readonly actor: RouteActor;
  readonly scenario: RouteScenario;
  readonly requirement: RouteActionClass;
}

export interface ProductiveRouteAcceptance extends ProductiveRouteDefinition {
  readonly url: string;
  readonly finalUrl: string;
  readonly heading: string;
  readonly readiness: string;
  readonly evidence: RouteEvidenceMode;
}

const definition = (pattern: string, surface: SurfaceIdentity, actor: RouteActor,
  scenario: RouteScenario): ProductiveRouteDefinition =>
  Object.freeze({ pattern, surface, actor, scenario, requirement: RouteActionClass.Read });

export const productiveRouteDefinitions: readonly ProductiveRouteDefinition[] = Object.freeze([
  definition('', SurfaceIdentity.Home, RouteActor.Anonymous, RouteScenario.Populated),
  definition('login', SurfaceIdentity.Login, RouteActor.Anonymous, RouteScenario.Populated),
  definition('recover', SurfaceIdentity.Recovery, RouteActor.Anonymous, RouteScenario.Populated),
  definition('reset-password', SurfaceIdentity.Recovery, RouteActor.Anonymous, RouteScenario.InvalidSecret),
  definition('verify-email', SurfaceIdentity.EmailVerification, RouteActor.Anonymous, RouteScenario.InvalidSecret),
  definition('catalog', SurfaceIdentity.Catalog, RouteActor.Anonymous, RouteScenario.Populated),
  definition('catalog/:sku', SurfaceIdentity.Product, RouteActor.Anonymous, RouteScenario.Populated),
  definition('cart', SurfaceIdentity.Cart, RouteActor.Customer, RouteScenario.Populated),
  definition('checkout', SurfaceIdentity.Checkout, RouteActor.Customer, RouteScenario.Populated),
  definition('checkout/result/:orderId', SurfaceIdentity.Result, RouteActor.Customer, RouteScenario.Populated),
  definition('customer/register', SurfaceIdentity.Registration, RouteActor.Anonymous, RouteScenario.Populated),
  definition('customer/profile', SurfaceIdentity.Profile, RouteActor.Customer, RouteScenario.Populated),
  definition('customer/addresses', SurfaceIdentity.Addresses, RouteActor.Customer, RouteScenario.Populated),
  definition('customer/favorites', SurfaceIdentity.Favorites, RouteActor.Customer, RouteScenario.Populated),
  definition('customer/orders', SurfaceIdentity.Orders, RouteActor.Customer, RouteScenario.Populated),
  definition('customer/orders/:id', SurfaceIdentity.Order, RouteActor.Customer, RouteScenario.Populated),
  definition('user/account', SurfaceIdentity.UserAccount, RouteActor.Admin, RouteScenario.Populated),
  definition('user/home', SurfaceIdentity.Overview, RouteActor.Admin, RouteScenario.Populated),
  definition('user/settings', SurfaceIdentity.Settings, RouteActor.Admin, RouteScenario.Populated),
  definition('user/content', SurfaceIdentity.Content, RouteActor.Admin, RouteScenario.Populated),
  definition('user/catalog', SurfaceIdentity.AdminCatalog, RouteActor.Admin, RouteScenario.Populated),
  definition('user/offers', SurfaceIdentity.Offers, RouteActor.Admin, RouteScenario.Populated),
  definition('user/customers', SurfaceIdentity.Customers, RouteActor.Admin, RouteScenario.Populated),
  definition('user/promos', SurfaceIdentity.Campaigns, RouteActor.Admin, RouteScenario.Populated),
  definition('user/orders', SurfaceIdentity.AdminOrders, RouteActor.Admin, RouteScenario.Populated),
  definition('user/orders/:id', SurfaceIdentity.AdminOrder, RouteActor.Admin, RouteScenario.Populated),
  definition('user/inventory', SurfaceIdentity.Inventory, RouteActor.Admin, RouteScenario.Populated),
  definition('user/mercadolibre', SurfaceIdentity.MercadoLibre, RouteActor.Admin, RouteScenario.Populated),
  definition('user/capabilities', SurfaceIdentity.Capabilities, RouteActor.Admin, RouteScenario.Populated),
  definition('user/profile-import', SurfaceIdentity.Configuration, RouteActor.Admin, RouteScenario.Populated),
]);

function canonical(pattern: string): ProductiveRouteDefinition {
  const found = productiveRouteDefinitions.find(item => item.pattern === pattern);
  if (!found) throw new Error(`Unknown productive route: ${pattern}`);
  return found;
}

const httpBinding = (pattern: string, url: string, heading: string, readiness: string): ProductiveRouteAcceptance =>
  Object.freeze({ ...canonical(pattern), url, finalUrl: url.split('#')[0], heading, readiness, evidence: RouteEvidenceMode.HttpFixture });

export const productiveHttpRouteBindings: readonly ProductiveRouteAcceptance[] = Object.freeze([
  httpBinding('', '/', 'Inicio', 'text=Portada de ruta'),
  httpBinding('login', '/login', 'Ingresar', '#login-title'),
  httpBinding('recover', '/recover', 'Recuperar acceso', '#recovery-title'),
  httpBinding('reset-password', '/reset-password#realm=customer&token=invalid', 'Nueva contraseña', '#recovery-title'),
  httpBinding('verify-email', '/verify-email#realm=customer&token=invalid', 'Verificar mi correo', '#verify-title'),
  httpBinding('catalog', '/catalog', 'Catálogo', 'text=Taladro de ruta'),
  httpBinding('catalog/:sku', '/catalog/ROUTE-SKU-1', 'Taladro de ruta', 'text=Taladro de ruta'),
  httpBinding('cart', '/cart', 'Carrito', 'text=ROUTE-SKU-1'),
  httpBinding('checkout', '/checkout', 'Checkout', 'text=Taladro de ruta'),
  httpBinding('checkout/result/:orderId', '/checkout/result/ROUTE-ORDER-1', 'Pedido iniciado', 'text=ROUTE-ORDER-1'),
  httpBinding('customer/register', '/customer/register', 'Crear cuenta customer', '#register-title'),
  httpBinding('customer/profile', '/customer/profile', 'Perfil customer', 'input[name="profileEmail"]'),
  httpBinding('customer/addresses', '/customer/addresses', 'Direcciones', 'text=Calle de ruta'),
  httpBinding('customer/favorites', '/customer/favorites', 'Tus favoritos', 'text=ROUTE-SKU-1'),
  httpBinding('customer/orders', '/customer/orders', 'Mis órdenes', 'text=ROUTE-ORDER-1'),
  httpBinding('customer/orders/:id', '/customer/orders/ROUTE-ORDER-1', 'Orden ROUTE-ORDER-1', 'text=Taladro de ruta'),
  httpBinding('user/account', '/user/account', 'Mi cuenta', '#account-title'),
  httpBinding('user/home', '/user/home', 'Resumen operativo', 'text=Taladro de ruta'),
  httpBinding('user/settings', '/user/settings', 'Apariencia', '#branding-name'),
  httpBinding('user/content', '/user/content', 'Diseñá tu inicio', 'text=Portada de ruta'),
  httpBinding('user/catalog', '/user/catalog', 'Catálogo operador', 'text=Taladro de ruta'),
  httpBinding('user/offers', '/user/offers', 'Ofertas locales', 'text=ROUTE-SKU-1'),
  httpBinding('user/customers', '/user/customers', 'Clientes', 'text=route.customer@example.test'),
  httpBinding('user/promos', '/user/promos', 'Políticas de precio manual', 'text=ROUTE-SKU-1'),
  httpBinding('user/orders', '/user/orders', 'Fulfillment', 'text=ROUTE-ORDER-1'),
  httpBinding('user/orders/:id', '/user/orders/ROUTE-ORDER-1', 'Fulfillment ROUTE-ORDER-1', 'text=Taladro de ruta'),
  httpBinding('user/inventory', '/user/inventory', 'Inventario WEB', 'text=ROUTE-SKU-1'),
  httpBinding('user/mercadolibre', '/user/mercadolibre', 'Mercado Libre', 'text=ROUTE-ML-1'),
  httpBinding('user/capabilities', '/user/capabilities', 'Módulos del comercio', 'text=Preparación y entregas'),
  httpBinding('user/profile-import', '/user/profile-import', 'Importar perfil', '#import-title'),
]);

// Existing HTTP consumers retain their source; evidence never changes globally.
export const productiveRouteManifest = productiveHttpRouteBindings;

export const productiveRedirectManifest = new Map<string, string>([
  ['customer/', '/login'],
  ['customer/session', 'redirect-function'],
  ['user/', 'home'],
  ['user/session', 'redirect-function'],
]);

export const productiveWildcardManifest = ['**', 'customer/**', 'user/**'] as const;

/** Each real binding is resolved from a validated receipt, never the HTTP fixture. */
export function bindProductiveRealRoutes(receipt: RealRouteReceipt): readonly ProductiveRouteAcceptance[] {
  if (!(receipt instanceof RealRouteReceipt) || receipt.pendingOrderId === null) throw new Error('Real matrix requires a validated pending order');
  const product = receipt.products[0];
  const cartProduct = receipt.products.find(item => item.sku === receipt.cart.skus[0]);
  if (!cartProduct) throw new Error('Real matrix requires a receipt cart product');
  const orderId = receipt.pendingOrderId;
  const textSelector = (value: string): string => `text=${JSON.stringify(value)}`;
  const real = (pattern: string, url: string, heading: string, readiness: string): ProductiveRouteAcceptance => {
    const entry = canonical(pattern);
    receipt.requireScenario(entry.scenario);
    return Object.freeze({ ...entry, url, finalUrl: url.split('#')[0], heading, readiness, evidence: RouteEvidenceMode.RealBackend });
  };
  const invalidSecret = `#realm=customer&token=${'a'.repeat(43)}`;
  return Object.freeze([
    real('', '/', 'Inicio', textSelector(receipt.homeTitle)),
    real('login', '/login', 'Ingresar', '#login-title'),
    real('recover', '/recover', 'Recuperar acceso', '#recovery-title'),
    real('reset-password', `/reset-password${invalidSecret}`, 'Nueva contraseña', '#recovery-title'),
    real('verify-email', `/verify-email${invalidSecret}`, 'Verificar mi correo', '#verify-title'),
    real('catalog', '/catalog', 'Catálogo', textSelector(product.name)),
    real('catalog/:sku', `/catalog/${encodeURIComponent(product.sku)}`, product.name, textSelector(product.name)),
    real('cart', '/cart', 'Carrito', textSelector(cartProduct.sku)),
    real('checkout', '/checkout', 'Checkout', textSelector(cartProduct.name)),
    real('checkout/result/:orderId', `/checkout/result/${encodeURIComponent(orderId)}`, 'Pedido iniciado', textSelector(`Orden ${orderId}`)),
    real('customer/register', '/customer/register', 'Crear cuenta customer', '#register-title'),
    real('customer/profile', '/customer/profile', 'Perfil customer', 'input[name="profileEmail"]'),
    real('customer/addresses', '/customer/addresses', 'Direcciones', textSelector(receipt.addressStreet)),
    real('customer/favorites', '/customer/favorites', 'Tus favoritos', textSelector(product.sku)),
    real('customer/orders', '/customer/orders', 'Mis órdenes', textSelector(orderId)),
    real('customer/orders/:id', `/customer/orders/${encodeURIComponent(orderId)}`, `Orden ${orderId}`, textSelector(product.name)),
    real('user/account', '/user/account', 'Mi cuenta', '#account-title'),
    real('user/home', '/user/home', 'Resumen operativo', '[aria-label="Indicadores del período"]'),
    real('user/settings', '/user/settings', 'Apariencia', '#branding-name'),
    real('user/content', '/user/content', 'Diseñá tu inicio', textSelector(receipt.homeTitle)),
    real('user/catalog', '/user/catalog', 'Catálogo operador', textSelector(product.name)),
    real('user/offers', '/user/offers', 'Ofertas locales', textSelector(product.sku)),
    real('user/customers', '/user/customers', 'Clientes', textSelector(receipt.customerEmail)),
    real('user/promos', '/user/promos', 'Políticas de precio manual', textSelector(product.sku)),
    real('user/orders', '/user/orders', 'Fulfillment', textSelector(orderId)),
    real('user/orders/:id', `/user/orders/${encodeURIComponent(orderId)}`, `Fulfillment ${orderId}`, textSelector(product.name)),
    real('user/inventory', '/user/inventory', 'Inventario WEB', textSelector(product.sku)),
    real('user/mercadolibre', '/user/mercadolibre', 'Mercado Libre', 'text=Sin publicaciones vinculadas'),
    real('user/capabilities', '/user/capabilities', 'Módulos del comercio', 'text=Preparación y entregas'),
    real('user/profile-import', '/user/profile-import', 'Importar perfil', '#import-title'),
  ]);
}
