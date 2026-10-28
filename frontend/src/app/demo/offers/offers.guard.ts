import {CanDeactivateFn} from '@angular/router';
import {DemoOffersComponent} from './offers.component';
export const offersCanDeactivate:CanDeactivateFn<DemoOffersComponent>=component=>component.canLeave();
