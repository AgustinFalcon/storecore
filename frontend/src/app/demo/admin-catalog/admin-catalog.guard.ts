import { CanDeactivateFn } from '@angular/router';
import { DemoAdminCatalogComponent } from './admin-catalog.component';
export const adminCatalogCanDeactivate:CanDeactivateFn<DemoAdminCatalogComponent>=component=>component.canLeave();
