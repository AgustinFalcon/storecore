/** Route state is closed; a URL is translated by the router's explicit table. */
export class DemoScreen {
  private constructor(readonly path: string, readonly title: string, readonly admin = false, readonly privateCustomer = false) {}
  static readonly Home = new DemoScreen('', 'Inicio');
  static readonly Login = new DemoScreen('login', 'Ingresar');
  static readonly Catalog = new DemoScreen('catalog', 'Catálogo');
  static readonly Product = new DemoScreen('catalog/:sku', 'Producto');
  static readonly Cart = new DemoScreen('cart', 'Tu carrito', false, true);
  static readonly Checkout = new DemoScreen('checkout', 'Finalizar compra', false, true);
  static readonly Result = new DemoScreen('checkout/result/:orderId', 'Resultado de compra', false, true);
  static readonly Register = new DemoScreen('customer/register', 'Crear cuenta');
  static readonly Profile = new DemoScreen('customer/profile', 'Mi perfil', false, true);
  static readonly Addresses = new DemoScreen('customer/addresses', 'Mis direcciones', false, true);
  static readonly Favorites = new DemoScreen('customer/favorites', 'Mis favoritos', false, true);
  static readonly Orders = new DemoScreen('customer/orders', 'Mis pedidos', false, true);
  static readonly Order = new DemoScreen('customer/orders/:id', 'Detalle del pedido', false, true);
  static readonly AdminHome = new DemoScreen('user/home', 'Resumen del comercio', true);
  static readonly Content = new DemoScreen('user/content', 'Contenido de la tienda', true);
  static readonly AdminCatalog = new DemoScreen('user/catalog', 'Productos y variantes', true);
  static readonly Offers = new DemoScreen('user/offers', 'Ofertas', true);
  static readonly Promos = new DemoScreen('user/promos', 'Campañas', true);
  static readonly AdminOrders = new DemoScreen('user/orders', 'Pedidos y entregas', true);
  static readonly AdminOrder = new DemoScreen('user/orders/:id', 'Preparar pedido', true);
  static readonly Inventory = new DemoScreen('user/inventory', 'Inventario', true);
  static readonly ML = new DemoScreen('user/mercadolibre', 'Mercado Libre', true);
  static readonly Capabilities = new DemoScreen('user/capabilities', 'Módulos del comercio', true);
  static readonly Configuration = new DemoScreen('user/profile-import', 'Configuración del comercio', true);
  static readonly Unknown = new DemoScreen('unknown', 'Página no reconocida');
  static readonly all = [this.Home, this.Login, this.Catalog, this.Product, this.Cart, this.Checkout, this.Result, this.Register, this.Profile, this.Addresses, this.Favorites, this.Orders, this.Order, this.AdminHome, this.Content, this.AdminCatalog, this.Offers, this.Promos, this.AdminOrders, this.AdminOrder, this.Inventory, this.ML, this.Capabilities, this.Configuration];
  static fromWire(raw: unknown): DemoScreen { return this.all.find(value => value.path === raw) ?? this.Unknown; }
}
