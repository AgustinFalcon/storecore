import { CanDeactivateFn } from '@angular/router';
import { UserBrandingComponent } from './user-branding.component';
export const userBrandingLeaveGuard: CanDeactivateFn<UserBrandingComponent> = component => component.canDeactivate();
