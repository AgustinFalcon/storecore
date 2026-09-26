import { Routes } from '@angular/router';
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
import { UserOrderDetailComponent } from './features/admin/user-order-detail.component';
import { UserPromosComponent } from './features/admin/user-promos.component';
import { UserSessionComponent } from './features/admin/user-session.component';
import { CartPageComponent } from './features/cart/cart-page.component';
import { CheckoutPageComponent } from './features/cart/checkout-page.component';
import { CheckoutResultComponent } from './features/cart/checkout-result.component';
import { CustomerAddressesComponent } from './features/identity/customer-addresses.component';
import { CustomerFavoritesComponent } from './features/identity/customer-favorites.component';
import { CustomerLayoutComponent } from './features/identity/customer-layout.component';
import { CustomerProfileComponent } from './features/identity/customer-profile.component';
import { CustomerRegisterComponent } from './features/identity/customer-register.component';
import { CustomerSessionComponent } from './features/identity/customer-session.component';
import { CustomerOrderDetailComponent } from './features/orders/customer-order-detail.component';
import { CustomerOrdersComponent } from './features/orders/customer-orders.component';
import { ShellComponent } from './features/shell/shell.component';
import { CatalogPageComponent } from './features/storefront/catalog-page.component';
import { ProductPageComponent } from './features/storefront/product-page.component';
import { StorefrontHomeComponent } from './features/storefront/storefront-home.component';

export const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
    children: [
      { path: '', component: StorefrontHomeComponent, title: 'StoreCore' },
      { path: 'catalog', component: CatalogPageComponent, title: 'Catálogo' },
      { path: 'catalog/:sku', component: ProductPageComponent, title: 'Producto' },
      { path: 'cart', component: CartPageComponent, title: 'Carrito', canActivate: [customerGuard] },
      { path: 'checkout', component: CheckoutPageComponent, title: 'Checkout', canActivate: [customerGuard] },
      { path: 'checkout/result/:orderId', component: CheckoutResultComponent, title: 'Pedido', canActivate: [customerGuard] },
      {
        path: 'customer',
        component: CustomerLayoutComponent,
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'session' },
          { path: 'session', component: CustomerSessionComponent, title: 'Customer' },
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
          { path: '', pathMatch: 'full', redirectTo: 'session' },
          { path: 'session', component: UserSessionComponent, title: 'User' },
          { path: 'content', component: UserContentComponent, title: 'Contenido', canActivate: [userGuard] },
          { path: 'catalog', component: UserCatalogComponent, title: 'Catálogo admin', canActivate: [userGuard] },
          { path: 'promos', component: UserPromosComponent, title: 'Promos', canActivate: [userGuard] },
          { path: 'orders', component: FulfillmentComponent, title: 'Fulfillment', canActivate: [userGuard] },
          { path: 'orders/:id', component: UserOrderDetailComponent, title: 'Fulfillment', canActivate: [userGuard] },
          { path: 'inventory', component: UserInventoryComponent, title: 'Inventario', canActivate: [userGuard] },
          { path: 'mercadolibre', component: UserMercadoLibreComponent, title: 'Mercado Libre', canActivate: [userGuard] },
          { path: 'capabilities', component: UserCapabilitiesComponent, title: 'Capabilities', canActivate: [userGuard] },
          { path: 'profile-import', component: ProfileImportComponent, title: 'Perfil', canActivate: [userGuard] },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
