import { Routes } from '@angular/router';
import { ReturnDestination } from './domain/access/return-destination';
import { RedirectFunction } from '@angular/router';
import { customerGuard } from './core/auth/customer.guard';
import { userGuard } from './core/auth/user.guard';
import { FulfillmentComponent } from './features/admin/fulfillment.component';
import { ProfileImportComponent } from './features/admin/profile-import.component';
import { UserCapabilitiesComponent } from './features/admin/user-capabilities.component';
import { UserCatalogComponent } from './features/admin/user-catalog.component';
import { UserContentComponent } from './features/admin/user-content.component';
import { UserInventoryComponent } from './features/admin/user-inventory.component';
import { UserLayoutComponent } from './features/admin/user-layout.component';
import { UserMercadoLibreComponent } from './features/admin/user-mercadolibre.component';
import { UserOffersComponent } from './features/admin/user-offers.component';
import { UserOrderDetailComponent } from './features/admin/user-order-detail.component';
import { UserPromosComponent } from './features/admin/user-promos.component';
import { UserHomeComponent } from './features/admin/user-home.component';
import { LoginComponent } from './features/identity/login.component';
import { UserAction } from './domain/user/user-action';
import { CartPageComponent } from './features/cart/cart-page.component';
import { CheckoutPageComponent } from './features/cart/checkout-page.component';
import { CheckoutResultComponent } from './features/cart/checkout-result.component';
import { CustomerAddressesComponent } from './features/identity/customer-addresses.component';
import { CustomerFavoritesComponent } from './features/identity/customer-favorites.component';
import { CustomerLayoutComponent } from './features/identity/customer-layout.component';
import { CustomerProfileComponent } from './features/identity/customer-profile.component';
import { CustomerRegisterComponent } from './features/identity/customer-register.component';
import { CustomerOrderDetailComponent } from './features/orders/customer-order-detail.component';
import { CustomerOrdersComponent } from './features/orders/customer-orders.component';
import { ShellComponent } from './features/shell/shell.component';
import { CatalogPageComponent } from './features/storefront/catalog-page.component';
import { ProductPageComponent } from './features/storefront/product-page.component';
import { StorefrontHomeComponent } from './features/storefront/storefront-home.component';

export const legacyLoginRedirect: RedirectFunction = ({ queryParams }) => {
  const destination = ReturnDestination.fromWire(queryParams['returnTo']);
  return destination === ReturnDestination.Unknown ? '/login' : `/login?returnTo=${destination.wire}`;
};

export const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
    children: [
      { path: '', component: StorefrontHomeComponent, title: 'StoreCore' },
      { path: 'login', component: LoginComponent, title: 'Ingresar' },
      { path: 'catalog', component: CatalogPageComponent, title: 'Catálogo' },
      { path: 'catalog/:sku', component: ProductPageComponent, title: 'Producto' },
      { path: 'cart', component: CartPageComponent, title: 'Carrito', canActivate: [customerGuard] },
      { path: 'checkout', component: CheckoutPageComponent, title: 'Checkout', canActivate: [customerGuard] },
      { path: 'checkout/result/:orderId', component: CheckoutResultComponent, title: 'Pedido', canActivate: [customerGuard] },
      {
        path: 'customer',
        component: CustomerLayoutComponent,
        children: [
          { path: '', pathMatch: 'full', redirectTo: '/login' },
          { path: 'session', pathMatch: 'full', redirectTo: legacyLoginRedirect },
          { path: 'register', component: CustomerRegisterComponent, title: 'Registro' },
          { path: 'profile', component: CustomerProfileComponent, title: 'Perfil', canActivate: [customerGuard] },
          { path: 'addresses', component: CustomerAddressesComponent, title: 'Direcciones', canActivate: [customerGuard] },
          { path: 'favorites', component: CustomerFavoritesComponent, title: 'Favoritos', canActivate: [customerGuard] },
          { path: 'orders', component: CustomerOrdersComponent, title: 'Órdenes', canActivate: [customerGuard] },
          { path: 'orders/:id', component: CustomerOrderDetailComponent, title: 'Orden', canActivate: [customerGuard] },
        ],
      },
      {
        path: 'user',
        component: UserLayoutComponent,
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'home' },
          { path: 'session', pathMatch: 'full', redirectTo: legacyLoginRedirect },
          { path: 'home', component: UserHomeComponent, title: 'Operaciones', canActivate: [userGuard] },
          { path: 'content', component: UserContentComponent, title: 'Contenido', canActivate: [userGuard], data: { action: UserAction.Content } },
          { path: 'catalog', component: UserCatalogComponent, title: 'Catálogo admin', canActivate: [userGuard], data: { action: UserAction.Catalog } },
          { path: 'offers', component: UserOffersComponent, title: 'Ofertas', canActivate: [userGuard], data: { action: UserAction.Offers } },
          { path: 'promos', component: UserPromosComponent, title: 'Promos', canActivate: [userGuard], data: { action: UserAction.Promos } },
          { path: 'orders', component: FulfillmentComponent, title: 'Fulfillment', canActivate: [userGuard], data: { action: UserAction.Orders } },
          { path: 'orders/:id', component: UserOrderDetailComponent, title: 'Fulfillment', canActivate: [userGuard], data: { action: UserAction.Orders } },
          { path: 'inventory', component: UserInventoryComponent, title: 'Inventario', canActivate: [userGuard], data: { action: UserAction.Inventory } },
          { path: 'mercadolibre', component: UserMercadoLibreComponent, title: 'Mercado Libre', canActivate: [userGuard], data: { action: UserAction.MercadoLibre } },
          { path: 'capabilities', component: UserCapabilitiesComponent, title: 'Capabilities', canActivate: [userGuard], data: { action: UserAction.Capabilities } },
          { path: 'profile-import', component: ProfileImportComponent, title: 'Perfil', canActivate: [userGuard], data: { action: UserAction.ProfileImport } },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
