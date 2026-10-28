import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { DemoPageComponent, DemoRootComponent } from './app/demo/demo.component';
import { DemoCustomersComponent } from './app/demo/customers/demo-customers.component';
import { DemoScreen } from './app/demo/demo-screen';
import { DemoSnapshotWriter } from './app/demo/demo-snapshot-writer';
import { DemoRecoveryComponent } from './app/demo/identity/demo-recovery.component';
import { DemoContentComponent } from './app/demo/content/content.component';
import { contentCanDeactivate } from './app/demo/content/content.guard';
import { DemoCheckoutResultComponent } from './app/demo/checkout/demo-checkout-result.component';
import { DemoOrderHistoryComponent } from './app/demo/orders/demo-order-history.component';
import { DemoAftercareComponent } from './app/demo/aftercare/aftercare.component';
import { DemoOverviewComponent } from './app/demo/overview/overview.component';
import { DemoAdminCatalogComponent } from './app/demo/admin-catalog/admin-catalog.component';
import { adminCatalogCanDeactivate } from './app/demo/admin-catalog/admin-catalog.guard';
import {DemoOffersComponent} from './app/demo/offers/offers.component';
import {offersCanDeactivate} from './app/demo/offers/offers.guard';

// Dedicated compilation entry: no HttpClient, real auth, cookie or API provider is reachable.
void DemoSnapshotWriter.browser.acquire().then(() => bootstrapApplication(DemoRootComponent, {
  providers: [provideRouter([{ path: 'demo', children: [
    ...DemoScreen.all.map(screen => ({ path: screen.path, component: screen === DemoScreen.Offers ? DemoOffersComponent : screen === DemoScreen.AdminCatalog ? DemoAdminCatalogComponent : screen === DemoScreen.AdminHome ? DemoOverviewComponent : screen === DemoScreen.Order ? DemoAftercareComponent : screen === DemoScreen.Orders ? DemoOrderHistoryComponent : screen === DemoScreen.Result ? DemoCheckoutResultComponent : screen === DemoScreen.Content ? DemoContentComponent : screen === DemoScreen.Recover ? DemoRecoveryComponent : screen === DemoScreen.Customers ? DemoCustomersComponent : DemoPageComponent, canDeactivate: screen === DemoScreen.Offers ? [offersCanDeactivate] : screen === DemoScreen.Content ? [contentCanDeactivate] : screen === DemoScreen.AdminCatalog ? [adminCatalogCanDeactivate] : [], title: `${screen.title} · StoreCore Demo`, data: { screen: screen.path } })),
    { path: 'customer/session', redirectTo: 'login', pathMatch: 'full' },
    { path: 'user/session', redirectTo: 'login', pathMatch: 'full' },
    { path: 'customer', redirectTo: 'login', pathMatch: 'full' },
    { path: 'user', redirectTo: 'user/home', pathMatch: 'full' },
    { path: '**', redirectTo: '' },
  ] }, { path: '**', redirectTo: 'demo' }])],
})).catch((error: unknown) => console.error(error));
window.addEventListener('pagehide', () => DemoSnapshotWriter.browser.release());
window.addEventListener('pageshow', event => { if (event.persisted) void DemoSnapshotWriter.browser.acquire(); });
