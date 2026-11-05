import {inject} from '@angular/core';
import {CanActivateFn,CanDeactivateFn,Router} from '@angular/router';
import {DemoApplicationState} from '../demo-state';
import {AuthorizeCampaignsStep} from './campaign-flow';
import {DemoCampaignsComponent} from './campaigns.component';
export const campaignsCanDeactivate:CanDeactivateFn<DemoCampaignsComponent>=component=>component.canLeave();
export const campaignsCanActivate:CanActivateFn=()=>{const state=inject(DemoApplicationState);return new AuthorizeCampaignsStep().permits({context:state.context(),role:state.role(),actor:state.actorId(),expectedActor:state.actorId(),epoch:state.sessionEpoch(),expectedEpoch:state.sessionEpoch(),readable:state.authorizationAvailable},state.data)?true:inject(Router).createUrlTree(['/demo/login']);};
