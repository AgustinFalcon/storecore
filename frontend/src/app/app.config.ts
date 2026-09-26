import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/auth/auth.interceptor';
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { CART_REPOSITORY } from './core/tokens/cart.tokens';
import { CATALOG_REPOSITORY } from './core/tokens/catalog.tokens';
import { CUSTOMER_REPOSITORY } from './core/tokens/customer.tokens';
import { HEALTH_REPOSITORY } from './core/tokens/health.tokens';
import { ORDER_REPOSITORY } from './core/tokens/order.tokens';
import { OFFER_REPOSITORY } from './core/tokens/offer.tokens';
import { USER_REPOSITORY } from './core/tokens/user.tokens';
import { CartHttpRepository } from './data/cart/cart-http.repository';
import { CatalogHttpRepository } from './data/catalog/catalog-http.repository';
import { CustomerHttpRepository } from './data/customer/customer-http.repository';
import { HealthHttpRepository } from './data/health/health-http.repository';
import { OfferHttpRepository } from './data/offer/offer-http.repository';
import { OrderHttpRepository } from './data/order/order-http.repository';
import { UserHttpRepository } from './data/user/user-http.repository';
import { AddCartLineUseCase } from './domain/cart/use-cases/add-cart-line.usecase';
import { CheckoutCartUseCase } from './domain/cart/use-cases/checkout-cart.usecase';
import { GetCartUseCase } from './domain/cart/use-cases/get-cart.usecase';
import { GetHomeUseCase } from './domain/catalog/use-cases/get-home.usecase';
import { GetProductUseCase } from './domain/catalog/use-cases/get-product.usecase';
import { ListCatalogFacetsUseCase } from './domain/catalog/use-cases/list-catalog-facets.usecase';
import { SearchCatalogUseCase } from './domain/catalog/use-cases/search-catalog.usecase';
import { DeleteCustomerAddressUseCase } from './domain/customer/use-cases/delete-customer-address.usecase';
import { GetCustomerProfileUseCase } from './domain/customer/use-cases/get-customer-profile.usecase';
import { ListCustomerAddressesUseCase } from './domain/customer/use-cases/list-customer-addresses.usecase';
import { ProbeCustomerSessionUseCase } from './domain/customer/use-cases/probe-customer-session.usecase';
import { SaveCustomerAddressUseCase } from './domain/customer/use-cases/save-customer-address.usecase';
import { SaveCustomerProfileUseCase } from './domain/customer/use-cases/save-customer-profile.usecase';
import { RegisterCustomerUseCase } from './domain/customer/use-cases/register-customer.usecase';
import { SignInCustomerUseCase } from './domain/customer/use-cases/sign-in-customer.usecase';
import { SignOutCustomerUseCase } from './domain/customer/use-cases/sign-out-customer.usecase';
import { GetHealthUseCase } from './domain/health/use-cases/get-health.usecase';
import { AdvanceFulfillmentUseCase } from './domain/order/use-cases/advance-fulfillment.usecase';
import { GetAdminOrderUseCase } from './domain/order/use-cases/get-admin-order.usecase';
import { GetMyOrderUseCase } from './domain/order/use-cases/get-my-order.usecase';
import { ListAdminOrdersUseCase } from './domain/order/use-cases/list-admin-orders.usecase';
import { ListMyOrdersUseCase } from './domain/order/use-cases/list-my-orders.usecase';
import { ManageStorefrontOffersUseCase } from './domain/offer/use-cases/manage-storefront-offers.usecase';
import { ImportProfileUseCase } from './domain/user/use-cases/import-profile.usecase';
import { ManageInstallationUseCase } from './domain/user/use-cases/manage-installation.usecase';
import { ManageAdminCatalogUseCase } from './domain/user/use-cases/manage-admin-catalog.usecase';
import { ManagePromosUseCase } from './domain/user/use-cases/manage-promos.usecase';
import { SaveHomeContentUseCase } from './domain/user/use-cases/save-home-content.usecase';
import { ProbeUserSessionUseCase } from './domain/user/use-cases/probe-user-session.usecase';
import { SignInUserUseCase } from './domain/user/use-cases/sign-in-user.usecase';
import { SignOutUserUseCase } from './domain/user/use-cases/sign-out-user.usecase';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(routes),
    { provide: HEALTH_REPOSITORY, useClass: HealthHttpRepository },
    { provide: CATALOG_REPOSITORY, useClass: CatalogHttpRepository },
    { provide: CUSTOMER_REPOSITORY, useClass: CustomerHttpRepository },
    { provide: CART_REPOSITORY, useClass: CartHttpRepository },
    { provide: ORDER_REPOSITORY, useClass: OrderHttpRepository },
    { provide: USER_REPOSITORY, useClass: UserHttpRepository },
    { provide: OFFER_REPOSITORY, useClass: OfferHttpRepository },
    GetHealthUseCase,
    SearchCatalogUseCase,
    GetHomeUseCase,
    GetProductUseCase,
    ListCatalogFacetsUseCase,
    RegisterCustomerUseCase,
    SignInCustomerUseCase,
    SignOutCustomerUseCase,
    ProbeCustomerSessionUseCase,
    GetCustomerProfileUseCase,
    SaveCustomerProfileUseCase,
    ListCustomerAddressesUseCase,
    SaveCustomerAddressUseCase,
    DeleteCustomerAddressUseCase,
    GetCartUseCase,
    AddCartLineUseCase,
    CheckoutCartUseCase,
    ListMyOrdersUseCase,
    GetMyOrderUseCase,
    ListAdminOrdersUseCase,
    GetAdminOrderUseCase,
    AdvanceFulfillmentUseCase,
    SignInUserUseCase,
    SignOutUserUseCase,
    ProbeUserSessionUseCase,
    SaveHomeContentUseCase,
    ManagePromosUseCase,
    ManageStorefrontOffersUseCase,
    ManageAdminCatalogUseCase,
    ImportProfileUseCase,
    ManageInstallationUseCase,
  ],
};
