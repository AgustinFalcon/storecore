import {Component,inject} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {toSignal} from '@angular/core/rxjs-interop';
import {map} from 'rxjs';
import {DemoApplicationState} from '../demo-state';
import {DemoLegacyOrderDetailComponent} from './legacy-order-detail.component';
import {DemoOrderDetailComponent} from './order-detail.component';
import {DemoOrderOperations} from './order-types';
import {AuthorizeDemoOrdersStep} from './order-flow';

/** Selects the closed operational capability without reading an unauthorized order. */
@Component({selector:'sc-demo-order-detail-host',imports:[DemoLegacyOrderDetailComponent,DemoOrderDetailComponent],template:'@if(operations()===Operations.Queue){<sc-demo-order-detail/>}@else{<sc-demo-legacy-order-detail/>}'})
export class DemoOrderDetailHostComponent {
 private readonly state=inject(DemoApplicationState);private readonly route=inject(ActivatedRoute);
 private readonly id=toSignal(this.route.paramMap.pipe(map(params=>params.get('id')??'')),{initialValue:''});
 readonly Operations=DemoOrderOperations;
 operations(){const state=this.state;if(!new AuthorizeDemoOrdersStep().permits({context:state.context(),role:state.role(),actor:state.actorId(),epoch:state.sessionEpoch(),readable:state.authorizationAvailable}))return DemoOrderOperations.Unknown;return DemoOrderOperations.fromWire(state.data.orders.find(order=>order.id===this.id()));}
}
