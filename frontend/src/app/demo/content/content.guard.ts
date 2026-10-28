import { CanDeactivateFn } from '@angular/router';
import { DemoContentComponent } from './content.component';
export const contentCanDeactivate: CanDeactivateFn<DemoContentComponent> = component => component.canLeave();
