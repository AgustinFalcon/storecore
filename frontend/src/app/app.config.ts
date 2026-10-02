import { USE_CASE_PROVIDERS } from './core/providers/use-case.providers';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/auth/auth.interceptor';
import { ApplicationConfig } from '@angular/core';
import { USE_CASE_PROVIDERS } from './core/providers/use-case.providers';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { CART_REPOSITORY } from './core/tokens/cart.tokens';
import { CATALOG_REPOSITORY } from './core/tokens/catalog.tokens';
import { CUSTOMER_REPOSITORY } from './core/tokens/customer.tokens';
import { HEALTH_REPOSITORY } from './core/tokens/health.tokens';
import { ORDER_REPOSITORY } from './core/tokens/order.tokens';
import { USER_REPOSITORY } from './core/tokens/user.tokens';
import { CartHttpRepository } from './data/cart/cart-http.repository';
import { CatalogHttpRepository } from './data/catalog/catalog-http.repository';
import { CustomerHttpRepository } from './data/customer/customer-http.repository';
import { HealthHttpRepository } from './data/health/health-http.repository';
import { OrderHttpRepository } from './data/order/order-http.repository';
import { UserHttpRepository } from './data/user/user-http.repository';

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
    ...USE_CASE_PROVIDERS,
  ],
};
