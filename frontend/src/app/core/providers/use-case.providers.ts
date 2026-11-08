import { Provider } from '@angular/core';
import { CustomerSession } from '../auth/customer-session';
import { UserSession } from '../auth/user-session';
import { CART_REPOSITORY } from '../tokens/cart.tokens';
import { ICartRepository } from '../../domain/cart/cart.repository';
import { CATALOG_REPOSITORY } from '../tokens/catalog.tokens';
import { ICatalogRepository } from '../../domain/catalog/catalog.repository';
import { CUSTOMER_REPOSITORY } from '../tokens/customer.tokens';
import { ICustomerRepository } from '../../domain/customer/customer.repository';
import { HEALTH_REPOSITORY } from '../tokens/health.tokens';
import { FAVORITE_REPOSITORY } from '../tokens/favorite.tokens';
import { IFavoriteRepository } from '../../domain/favorite/favorite.repository';
import { IHealthRepository } from '../../domain/health/health.repository';
import { ORDER_REPOSITORY } from '../tokens/order.tokens';
import { OFFER_REPOSITORY } from '../tokens/offer.tokens';
import { CUSTOMER_ADMIN_REPOSITORY } from '../tokens/customer-admin.tokens';
import { IOrderRepository } from '../../domain/order/order.repository';
import { IOfferRepository } from '../../domain/offer/offer.repository';
import { ICustomerAdminRepository } from '../../domain/customer-admin/customer-admin.repository';
import { OVERVIEW_REPOSITORY } from '../tokens/overview.tokens';
import { IOverviewRepository } from '../../domain/overview/overview.repository';
import { USER_REPOSITORY } from '../tokens/user.tokens';
import { IUserRepository } from '../../domain/user/user.repository';
import { AddCartLineUseCase } from '../../domain/cart/use-cases/add-cart-line.usecase';
import { CheckoutCartUseCase } from '../../domain/cart/use-cases/checkout-cart.usecase';
import { GetCartUseCase } from '../../domain/cart/use-cases/get-cart.usecase';
import { GetHomeUseCase } from '../../domain/catalog/use-cases/get-home.usecase';
import { GetProductUseCase } from '../../domain/catalog/use-cases/get-product.usecase';
import { ListCatalogFacetsUseCase } from '../../domain/catalog/use-cases/list-catalog-facets.usecase';
import { SearchCatalogUseCase } from '../../domain/catalog/use-cases/search-catalog.usecase';
import { DeleteCustomerAddressUseCase } from '../../domain/customer/use-cases/delete-customer-address.usecase';
import { GetCustomerProfileUseCase } from '../../domain/customer/use-cases/get-customer-profile.usecase';
import { ListCustomerAddressesUseCase } from '../../domain/customer/use-cases/list-customer-addresses.usecase';
import { ProbeCustomerSessionUseCase } from '../../domain/customer/use-cases/probe-customer-session.usecase';
import { RegisterCustomerUseCase } from '../../domain/customer/use-cases/register-customer.usecase';
import { SaveCustomerAddressUseCase } from '../../domain/customer/use-cases/save-customer-address.usecase';
import { SaveCustomerProfileUseCase } from '../../domain/customer/use-cases/save-customer-profile.usecase';
import { SignInCustomerUseCase } from '../../domain/customer/use-cases/sign-in-customer.usecase';
import { SignOutCustomerUseCase } from '../../domain/customer/use-cases/sign-out-customer.usecase';
import { GetHealthUseCase } from '../../domain/health/use-cases/get-health.usecase';
import { AddFavoriteUseCase } from '../../domain/favorite/use-cases/add-favorite.usecase';
import { ListFavoritesUseCase } from '../../domain/favorite/use-cases/list-favorites.usecase';
import { RemoveFavoriteUseCase } from '../../domain/favorite/use-cases/remove-favorite.usecase';
import { AdvanceFulfillmentUseCase } from '../../domain/order/use-cases/advance-fulfillment.usecase';
import { GetAdminOrderUseCase } from '../../domain/order/use-cases/get-admin-order.usecase';
import { GetMyOrderUseCase } from '../../domain/order/use-cases/get-my-order.usecase';
import { ListAdminOrdersUseCase } from '../../domain/order/use-cases/list-admin-orders.usecase';
import { ListMyOrdersUseCase } from '../../domain/order/use-cases/list-my-orders.usecase';
import { CreateOfferUseCase } from '../../domain/offer/use-cases/create-offer.usecase';
import { ListOffersUseCase } from '../../domain/offer/use-cases/list-offers.usecase';
import { TransitionOfferUseCase } from '../../domain/offer/use-cases/transition-offer.usecase';
import { GetCustomerUseCase } from '../../domain/customer-admin/use-cases/get-customer.usecase';
import { ListCustomersUseCase } from '../../domain/customer-admin/use-cases/list-customers.usecase';
import { TransitionCustomerUseCase } from '../../domain/customer-admin/use-cases/transition-customer.usecase';
import { ReadOverviewUseCase } from '../../domain/overview/use-cases/read-overview.usecase';
import { ImportProfileUseCase } from '../../domain/user/use-cases/import-profile.usecase';
import { ManageAdminCatalogUseCase } from '../../domain/user/use-cases/manage-admin-catalog.usecase';
import { ManageInstallationUseCase } from '../../domain/user/use-cases/manage-installation.usecase';
import { ReadCapabilitiesUseCase } from '../../domain/user/use-cases/read-capabilities.usecase';
import { ManagePromosUseCase } from '../../domain/user/use-cases/manage-promos.usecase';
import { ProbeUserSessionUseCase } from '../../domain/user/use-cases/probe-user-session.usecase';
import { SaveHomeContentUseCase } from '../../domain/user/use-cases/save-home-content.usecase';
import { SignInUserUseCase } from '../../domain/user/use-cases/sign-in-user.usecase';
import { SignOutUserUseCase } from '../../domain/user/use-cases/sign-out-user.usecase';

/** Angular composition lives outside the framework-free use cases. */
export const USE_CASE_PROVIDERS: Provider[] = [
  { provide: ReadOverviewUseCase, useFactory: (repo: IOverviewRepository) => new ReadOverviewUseCase(repo), deps: [OVERVIEW_REPOSITORY] },
  { provide: GetCustomerUseCase, useFactory: (repo: ICustomerAdminRepository) => new GetCustomerUseCase(repo), deps: [CUSTOMER_ADMIN_REPOSITORY] },
  { provide: ListCustomersUseCase, useFactory: (repo: ICustomerAdminRepository) => new ListCustomersUseCase(repo), deps: [CUSTOMER_ADMIN_REPOSITORY] },
  { provide: TransitionCustomerUseCase, useFactory: (repo: ICustomerAdminRepository) => new TransitionCustomerUseCase(repo), deps: [CUSTOMER_ADMIN_REPOSITORY] },
  { provide: CreateOfferUseCase, useFactory: (repo: IOfferRepository) => new CreateOfferUseCase(repo), deps: [OFFER_REPOSITORY] },
  { provide: ListOffersUseCase, useFactory: (repo: IOfferRepository) => new ListOffersUseCase(repo), deps: [OFFER_REPOSITORY] },
  { provide: TransitionOfferUseCase, useFactory: (repo: IOfferRepository) => new TransitionOfferUseCase(repo), deps: [OFFER_REPOSITORY] },
  { provide: AddFavoriteUseCase, useFactory: (repo: IFavoriteRepository) => new AddFavoriteUseCase(repo), deps: [FAVORITE_REPOSITORY] },
  { provide: ListFavoritesUseCase, useFactory: (repo: IFavoriteRepository) => new ListFavoritesUseCase(repo), deps: [FAVORITE_REPOSITORY] },
  { provide: RemoveFavoriteUseCase, useFactory: (repo: IFavoriteRepository) => new RemoveFavoriteUseCase(repo), deps: [FAVORITE_REPOSITORY] },
  { provide: AddCartLineUseCase, useFactory: (repo: ICartRepository) => new AddCartLineUseCase(repo), deps: [CART_REPOSITORY] },
  { provide: CheckoutCartUseCase, useFactory: (repo: ICartRepository) => new CheckoutCartUseCase(repo), deps: [CART_REPOSITORY] },
  { provide: GetCartUseCase, useFactory: (repo: ICartRepository) => new GetCartUseCase(repo), deps: [CART_REPOSITORY] },
  { provide: GetHomeUseCase, useFactory: (repo: ICatalogRepository) => new GetHomeUseCase(repo), deps: [CATALOG_REPOSITORY] },
  { provide: GetProductUseCase, useFactory: (repo: ICatalogRepository) => new GetProductUseCase(repo), deps: [CATALOG_REPOSITORY] },
  { provide: ListCatalogFacetsUseCase, useFactory: (repo: ICatalogRepository) => new ListCatalogFacetsUseCase(repo), deps: [CATALOG_REPOSITORY] },
  { provide: SearchCatalogUseCase, useFactory: (repo: ICatalogRepository) => new SearchCatalogUseCase(repo), deps: [CATALOG_REPOSITORY] },
  { provide: DeleteCustomerAddressUseCase, useFactory: (repo: ICustomerRepository) => new DeleteCustomerAddressUseCase(repo), deps: [CUSTOMER_REPOSITORY] },
  { provide: GetCustomerProfileUseCase, useFactory: (repo: ICustomerRepository) => new GetCustomerProfileUseCase(repo), deps: [CUSTOMER_REPOSITORY] },
  { provide: ListCustomerAddressesUseCase, useFactory: (repo: ICustomerRepository) => new ListCustomerAddressesUseCase(repo), deps: [CUSTOMER_REPOSITORY] },
  { provide: ProbeCustomerSessionUseCase, useFactory: (repo: ICustomerRepository, session: CustomerSession) => new ProbeCustomerSessionUseCase(repo, session), deps: [CUSTOMER_REPOSITORY, CustomerSession] },
  { provide: RegisterCustomerUseCase, useFactory: (repo: ICustomerRepository, session: CustomerSession) => new RegisterCustomerUseCase(repo, session), deps: [CUSTOMER_REPOSITORY, CustomerSession] },
  { provide: SaveCustomerAddressUseCase, useFactory: (repo: ICustomerRepository) => new SaveCustomerAddressUseCase(repo), deps: [CUSTOMER_REPOSITORY] },
  { provide: SaveCustomerProfileUseCase, useFactory: (repo: ICustomerRepository) => new SaveCustomerProfileUseCase(repo), deps: [CUSTOMER_REPOSITORY] },
  { provide: SignInCustomerUseCase, useFactory: (repo: ICustomerRepository, session: CustomerSession) => new SignInCustomerUseCase(repo, session), deps: [CUSTOMER_REPOSITORY, CustomerSession] },
  { provide: SignOutCustomerUseCase, useFactory: (repo: ICustomerRepository, session: CustomerSession) => new SignOutCustomerUseCase(repo, session), deps: [CUSTOMER_REPOSITORY, CustomerSession] },
  { provide: GetHealthUseCase, useFactory: (repo: IHealthRepository) => new GetHealthUseCase(repo), deps: [HEALTH_REPOSITORY] },
  { provide: AdvanceFulfillmentUseCase, useFactory: (repo: IOrderRepository) => new AdvanceFulfillmentUseCase(repo), deps: [ORDER_REPOSITORY] },
  { provide: GetAdminOrderUseCase, useFactory: (repo: IOrderRepository) => new GetAdminOrderUseCase(repo), deps: [ORDER_REPOSITORY] },
  { provide: GetMyOrderUseCase, useFactory: (repo: IOrderRepository) => new GetMyOrderUseCase(repo), deps: [ORDER_REPOSITORY] },
  { provide: ListAdminOrdersUseCase, useFactory: (repo: IOrderRepository) => new ListAdminOrdersUseCase(repo), deps: [ORDER_REPOSITORY] },
  { provide: ListMyOrdersUseCase, useFactory: (repo: IOrderRepository) => new ListMyOrdersUseCase(repo), deps: [ORDER_REPOSITORY] },
  { provide: ImportProfileUseCase, useFactory: (repo: IUserRepository) => new ImportProfileUseCase(repo), deps: [USER_REPOSITORY] },
  { provide: ManageAdminCatalogUseCase, useFactory: (repo: IUserRepository) => new ManageAdminCatalogUseCase(repo), deps: [USER_REPOSITORY] },
  { provide: ManageInstallationUseCase, useFactory: (repo: IUserRepository) => new ManageInstallationUseCase(repo), deps: [USER_REPOSITORY] },
  { provide: ReadCapabilitiesUseCase, useFactory: (repo: IUserRepository) => new ReadCapabilitiesUseCase(repo), deps: [USER_REPOSITORY] },
  { provide: ManagePromosUseCase, useFactory: (repo: IUserRepository) => new ManagePromosUseCase(repo), deps: [USER_REPOSITORY] },
  { provide: ProbeUserSessionUseCase, useFactory: (repo: IUserRepository, session: UserSession) => new ProbeUserSessionUseCase(repo, session), deps: [USER_REPOSITORY, UserSession] },
  { provide: SaveHomeContentUseCase, useFactory: (repo: IUserRepository) => new SaveHomeContentUseCase(repo), deps: [USER_REPOSITORY] },
  { provide: SignInUserUseCase, useFactory: (repo: IUserRepository, session: UserSession) => new SignInUserUseCase(repo, session), deps: [USER_REPOSITORY, UserSession] },
  { provide: SignOutUserUseCase, useFactory: (repo: IUserRepository, session: UserSession) => new SignOutUserUseCase(repo, session), deps: [USER_REPOSITORY, UserSession] },
];
