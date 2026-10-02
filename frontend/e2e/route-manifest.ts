export enum ScreenRealm { Public, Customer, User }

export interface Screen {
  readonly pattern: string;
  readonly url: string;
  readonly realm: ScreenRealm;
  readonly heading: string;
  readonly ready: string;
  readonly loadedValues: readonly { readonly selector: string; readonly value: string }[];
  readonly loadedTexts: readonly { readonly selector: string; readonly text: string }[];
}

const screen = (pattern: string, realm: ScreenRealm, heading: string, ready: string,
  loaded: Pick<Screen, 'loadedValues' | 'loadedTexts'> = { loadedValues: [], loadedTexts: [] }): Screen => ({
  pattern, realm, heading, ready,
  ...loaded,
  url: pattern.replace(':sku', 'TEST-SKU').replace(':orderId', 'test-order').replace(':id', 'test-order'),
});

export const screens: readonly Screen[] = [
  screen('/', ScreenRealm.Public, 'Inicio', '.sc-carousel__slide'),
  screen('/catalog', ScreenRealm.Public, 'Catálogo', 'sc-product-tile'),
  screen('/catalog/:sku', ScreenRealm.Public, 'Producto de prueba', '.sc-pdp'),
  screen('/cart', ScreenRealm.Customer, 'Carrito', 'tbody tr'),
  screen('/checkout', ScreenRealm.Customer, 'Checkout', 'select[name="addressId"] option[value="test-address"]'),
  screen('/checkout/result/:orderId', ScreenRealm.Customer, 'Pedido iniciado', '.sc-result__card'),
  screen('/customer/session', ScreenRealm.Public, 'Sesión customer', 'input[name="email"]'),
  screen('/customer/register', ScreenRealm.Public, 'Crear cuenta customer', 'input[name="email"]'),
  screen('/customer/profile', ScreenRealm.Customer, 'Perfil customer', 'input[name="firstName"]', {
    loadedValues: [
      { selector: 'input[name="firstName"]', value: 'Cliente' },
      { selector: 'input[name="lastName"]', value: 'Prueba' },
      { selector: 'input[name="profileEmail"]', value: 'customer@example.invalid' },
    ], loadedTexts: [],
  }),
  screen('/customer/addresses', ScreenRealm.Customer, 'Direcciones', '.sc-address-list li'),
  screen('/customer/favorites', ScreenRealm.Customer, 'Favoritos', '.sc-fav-list a'),
  screen('/customer/orders', ScreenRealm.Customer, 'Mis órdenes', '.sc-order-list > .sc-order-card', {
    loadedValues: [], loadedTexts: [
      { selector: '.sc-order-card a[href="/customer/orders/test-order"]', text: 'test-order' },
      { selector: '.sc-order-card__lines', text: 'Producto de prueba' },
    ],
  }),
  screen('/customer/orders/:id', ScreenRealm.Customer, 'Orden test-order', 'tbody tr'),
  screen('/user/session', ScreenRealm.Public, 'Sesión user', 'input[name="userEmail"]'),
  screen('/user/content', ScreenRealm.User, 'Contenido del home', 'input[name="homeTitle"]', {
    loadedValues: [
      { selector: 'input[name="homeTitle"]', value: 'Home de prueba' },
      { selector: 'textarea[name="homeBody"]', value: 'Contenido de prueba' },
    ],
    loadedTexts: [
      { selector: 'section[aria-labelledby="banner-blocks-title"] li', text: 'Bloque de prueba' },
      { selector: 'section[aria-labelledby="banner-blocks-title"] li', text: 'Texto de prueba' },
    ],
  }),
  screen('/user/catalog', ScreenRealm.User, 'Catálogo operador', 'tbody tr'),
  screen('/user/offers', ScreenRealm.User, 'Ofertas de vitrina', 'tbody tr'),
  screen('/user/promos', ScreenRealm.User, 'Promos MANUAL', 'tbody tr'),
  screen('/user/orders', ScreenRealm.User, 'Fulfillment', 'tbody tr'),
  screen('/user/orders/:id', ScreenRealm.User, 'Fulfillment test-order', 'tbody tr'),
  screen('/user/inventory', ScreenRealm.User, 'Inventario WEB', 'tbody tr'),
  screen('/user/mercadolibre', ScreenRealm.User, 'Mercado Libre', 'tbody tr'),
  screen('/user/capabilities', ScreenRealm.User, 'Capabilities', 'tbody tr'),
  screen('/user/profile-import', ScreenRealm.User, 'Importar perfil', 'textarea[name="manifest"]'),
];
