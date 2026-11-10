import { RedirectFunction, Routes } from '@angular/router';
import { ReturnDestination } from './domain/access/return-destination';
import { LoginComponent } from './features/access/login.component';
import { customerGuard } from './core/auth/customer.guard';
import { userGuard } from './core/auth/user.guard';
import { userContentLeaveGuard } from './features/admin/user-content-leave.guard';
import { UserLayoutComponent } from './features/admin/user-layout.component';
import { CartPageComponent } from './features/cart/cart-page.component';
import { CheckoutPageComponent } from './features/cart/checkout-page.component';
import { CheckoutResultComponent } from './features/cart/checkout-result.component';
import { CustomerAddressesComponent } from './features/identity/customer-addresses.component';
import { CustomerLayoutComponent } from './features/identity/customer-layout.component';
import { CustomerProfileComponent } from './features/identity/customer-profile.component';
import { CustomerFavoritesComponent } from './features/identity/customer-favorites.component';
import { CustomerRegisterComponent } from './features/identity/customer-register.component';
import { CustomerOrderDetailComponent } from './features/orders/customer-order-detail.component';
import { CustomerOrdersComponent } from './features/orders/customer-orders.component';
import { ShellComponent } from './features/shell/shell.component';
import { CatalogPageComponent } from './features/storefront/catalog-page.component';
import { ProductPageComponent } from './features/storefront/product-page.component';
import { StorefrontHomeComponent } from './features/storefront/storefront-home.component';
import { NotFoundComponent } from './features/navigation/not-found.component';

const legacyLoginRedirect: RedirectFunction = ({ queryParams }) => {
  const destination = ReturnDestination.fromWire(queryParams['returnTo']);
  return destination !== ReturnDestination.Unknown ? `/login?returnTo=${encodeURIComponent(destination.wire)}` : '/login';
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
          { path: 'session', redirectTo: legacyLoginRedirect },
          { path: 'register', component: CustomerRegisterComponent, title: 'Registro' },
          { path: 'profile', component: CustomerProfileComponent, title: 'Perfil', canActivate: [customerGuard] },
          { path: 'addresses', component: CustomerAddressesComponent, title: 'Direcciones', canActivate: [customerGuard] },
          { path: 'favorites', component: CustomerFavoritesComponent, title: 'Favoritos', canActivate: [customerGuard] },
          { path: 'orders', component: CustomerOrdersComponent, title: 'Órdenes', canActivate: [customerGuard] },
          { path: 'orders/:id', component: CustomerOrderDetailComponent, title: 'Orden', canActivate: [customerGuard] },
          { path: '**', component: NotFoundComponent, title: 'Página no encontrada' },
        ],
      },
      {
        path: 'user',
        component: UserLayoutComponent,
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'home' },
          { path: 'session', redirectTo: legacyLoginRedirect },
          {
            path: 'home',
            loadComponent: () => import('./features/admin/user-home.component').then((module) => module.UserHomeComponent),
            title: 'Operaciones',
            canActivate: [userGuard],
          },
          {
            path: 'content',
            loadComponent: () => import('./features/admin/user-content.component').then((module) => module.UserContentComponent),
            title: 'Contenido',
            canActivate: [userGuard],
            canDeactivate: [userContentLeaveGuard],
          },
          {
            path: 'catalog',
            loadComponent: () => import('./features/admin/user-catalog.component').then((module) => module.UserCatalogComponent),
            title: 'Catálogo admin',
            canActivate: [userGuard],
          },
          {
            path: 'offers',
            loadComponent: () => import('./features/admin/user-offers.component').then((module) => module.UserOffersComponent),
            title: 'Ofertas',
            canActivate: [userGuard],
          },
          {
            path: 'customers',
            loadComponent: () => import('./features/admin/user-customers.component').then((module) => module.UserCustomersComponent),
            title: 'Clientes',
            canActivate: [userGuard],
          },
          {
            path: 'promos',
            loadComponent: () => import('./features/admin/user-promos.component').then((module) => module.UserPromosComponent),
            title: 'Promos',
            canActivate: [userGuard],
          },
          {
            path: 'orders',
            loadComponent: () => import('./features/admin/fulfillment.component').then((module) => module.FulfillmentComponent),
            title: 'Fulfillment',
            canActivate: [userGuard],
          },
          {
            path: 'orders/:id',
            loadComponent: () => import('./features/admin/user-order-detail.component').then((module) => module.UserOrderDetailComponent),
            title: 'Fulfillment',
            canActivate: [userGuard],
          },
          {
            path: 'inventory',
            loadComponent: () => import('./features/admin/user-inventory.component').then((module) => module.UserInventoryComponent),
            title: 'Inventario',
            canActivate: [userGuard],
          },
          {
            path: 'mercadolibre',
            loadComponent: () => import('./features/admin/user-mercadolibre.component').then((module) => module.UserMercadoLibreComponent),
            title: 'Mercado Libre',
            canActivate: [userGuard],
          },
          {
            path: 'capabilities',
            loadComponent: () => import('./features/admin/user-capabilities.component').then((module) => module.UserCapabilitiesComponent),
            title: 'Capabilities',
            canActivate: [userGuard],
          },
          {
            path: 'profile-import',
            loadComponent: () => import('./features/admin/profile-import.component').then((module) => module.ProfileImportComponent),
            title: 'Perfil',
            canActivate: [userGuard],
          },
          { path: '**', component: NotFoundComponent, title: 'Página no encontrada' },
        ],
      },
      { path: '**', component: NotFoundComponent, title: 'Página no encontrada' },
    ],
  },
];
