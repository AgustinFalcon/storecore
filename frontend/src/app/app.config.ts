import { USE_CASE_PROVIDERS } from './core/providers/use-case.providers';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/auth/auth.interceptor';
import { ApplicationConfig, inject } from '@angular/core';
import { SurfaceTarget } from './domain/navigation/surface-identity';
import { provideSurfaceIdentity } from './features/navigation/surface-host';
import { AccessCoordinator } from './core/auth/access-coordinator';
import { AccessContext } from './domain/access/access-context';
import { CustomerSession } from './core/auth/customer-session';
import { UserSession } from './core/auth/user-session';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { CART_REPOSITORY } from './core/tokens/cart.tokens';
import { CATALOG_REPOSITORY } from './core/tokens/catalog.tokens';
import { CUSTOMER_REPOSITORY } from './core/tokens/customer.tokens';
import { HEALTH_REPOSITORY } from './core/tokens/health.tokens';
import { FAVORITE_REPOSITORY } from './core/tokens/favorite.tokens';
import { ORDER_REPOSITORY } from './core/tokens/order.tokens';
import { USER_REPOSITORY } from './core/tokens/user.tokens';
import { ACCESS_REPOSITORY } from './core/tokens/access.tokens';
import { AccessHttpRepository } from './data/access/access-http.repository';
import { CartHttpRepository } from './data/cart/cart-http.repository';
import { CatalogHttpRepository } from './data/catalog/catalog-http.repository';
import { CustomerHttpRepository } from './data/customer/customer-http.repository';
import { HealthHttpRepository } from './data/health/health-http.repository';
import { FavoriteHttpRepository } from './data/favorite/favorite-http.repository';
import { OrderHttpRepository } from './data/order/order-http.repository';
import { UserHttpRepository } from './data/user/user-http.repository';

export const appConfig: ApplicationConfig = {
  providers: [
    ...provideSurfaceIdentity(SurfaceTarget.Real, () => {
      const access = inject(AccessCoordinator);
      const customer = inject(CustomerSession);
      const user = inject(UserSession);
      return () => {
        const context = access.state().activeContext;
        if (context === AccessContext.Customer) return `customer:${customer.actorIdentity() ?? 'unavailable'}`;
        if (context === AccessContext.User) return `user:${user.principal()?.id ?? 'unavailable'}`;
        return 'public';
      };
    }),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(routes),
    { provide: HEALTH_REPOSITORY, useClass: HealthHttpRepository },
    { provide: FAVORITE_REPOSITORY, useClass: FavoriteHttpRepository },
    { provide: CATALOG_REPOSITORY, useClass: CatalogHttpRepository },
    { provide: CUSTOMER_REPOSITORY, useClass: CustomerHttpRepository },
    { provide: CART_REPOSITORY, useClass: CartHttpRepository },
    { provide: ORDER_REPOSITORY, useClass: OrderHttpRepository },
    { provide: USER_REPOSITORY, useClass: UserHttpRepository },
    { provide: ACCESS_REPOSITORY, useClass: AccessHttpRepository },
    ...USE_CASE_PROVIDERS,
  ],
};
