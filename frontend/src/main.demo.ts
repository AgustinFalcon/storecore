import {DemoProfileComponent} from './app/demo/profile/profile.component';
import {DemoCapabilitiesComponent} from './app/demo/capabilities/capabilities.component';
import {DemoAdminOrdersComponent} from './app/demo/admin-orders/admin-orders.component';
import {DemoInventoryComponent} from './app/demo/inventory/inventory.component';
import {DemoMercadoLibreComponent} from './app/demo/mercadolibre/mercadolibre.component';
import {DemoOrderDetailHostComponent} from './app/demo/admin-orders/order-detail-host.component';
import {DemoCampaignsComponent} from './app/demo/campaigns/campaigns.component';
import {campaignsCanDeactivate,campaignsCanActivate} from './app/demo/campaigns/campaigns.guard';
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
import { inject } from '@angular/core';
import { DemoApplicationState } from './app/demo/demo-state';
import { DemoContext } from './app/demo/demo-model';
import { SurfaceTarget } from './app/domain/navigation/surface-identity';
import { provideSurfaceIdentity } from './app/features/navigation/surface-host';
import { NotFoundComponent } from './app/features/navigation/not-found.component';

// Dedicated compilation entry: no HttpClient, real auth, cookie or API provider is reachable.
void DemoSnapshotWriter.browser.acquire().then(() => bootstrapApplication(DemoRootComponent, {
  providers: [...provideSurfaceIdentity(SurfaceTarget.Demo, () => {
    const state = inject(DemoApplicationState);
    return () => state.context() === DemoContext.Unknown ? 'public' : `${state.context().wire}:${state.actorId()}`;
  }), provideRouter([{ path: 'demo', children: [
    ...DemoScreen.all.map(screen => ({ path: screen.path, component: screen === DemoScreen.Configuration ? DemoProfileComponent : screen === DemoScreen.Capabilities ? DemoCapabilitiesComponent : screen === DemoScreen.ML ? DemoMercadoLibreComponent : screen === DemoScreen.Inventory ? DemoInventoryComponent : screen === DemoScreen.AdminOrders ? DemoAdminOrdersComponent : screen === DemoScreen.AdminOrder ? DemoOrderDetailHostComponent : screen === DemoScreen.Promos ? DemoCampaignsComponent : screen === DemoScreen.Offers ? DemoOffersComponent : screen === DemoScreen.AdminCatalog ? DemoAdminCatalogComponent : screen === DemoScreen.AdminHome ? DemoOverviewComponent : screen === DemoScreen.Order ? DemoAftercareComponent : screen === DemoScreen.Orders ? DemoOrderHistoryComponent : screen === DemoScreen.Result ? DemoCheckoutResultComponent : screen === DemoScreen.Content ? DemoContentComponent : screen === DemoScreen.Recover ? DemoRecoveryComponent : screen === DemoScreen.Customers ? DemoCustomersComponent : DemoPageComponent, canActivate: screen === DemoScreen.Promos ? [campaignsCanActivate] : [], canDeactivate: screen === DemoScreen.Promos ? [campaignsCanDeactivate] : screen === DemoScreen.Offers ? [offersCanDeactivate] : screen === DemoScreen.Content ? [contentCanDeactivate] : screen === DemoScreen.AdminCatalog ? [adminCatalogCanDeactivate] : [], title: `${screen.title} · StoreCore Demo`, data: { screen: screen.path } })),
    { path: 'customer/session', redirectTo: 'login', pathMatch: 'full' },
    { path: 'user/session', redirectTo: 'login', pathMatch: 'full' },
    { path: 'customer', redirectTo: 'login', pathMatch: 'full' },
    { path: 'user', redirectTo: 'user/home', pathMatch: 'full' },
    { path: '**', component: NotFoundComponent, title: 'Página no encontrada · StoreCore Demo' },
  ] }, { path: '**', component: NotFoundComponent, title: 'Página no encontrada · StoreCore Demo' }])],
})).catch((error: unknown) => console.error(error));
window.addEventListener('pagehide', () => DemoSnapshotWriter.browser.release());
window.addEventListener('pageshow', event => { if (event.persisted) void DemoSnapshotWriter.browser.acquire(); });
