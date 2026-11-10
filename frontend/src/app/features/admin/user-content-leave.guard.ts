import type { CanDeactivateFn } from '@angular/router';

interface UserContentLeaveTarget {
  canDeactivate(): boolean;
}

export const userContentLeaveGuard: CanDeactivateFn<UserContentLeaveTarget> = (component) => component.canDeactivate();
