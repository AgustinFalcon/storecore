import {Component,ElementRef,afterRenderEffect,inject,viewChild} from '@angular/core';
import {ActivatedRoute,Router,RouterLink} from '@angular/router';
import {toSignal} from '@angular/core/rxjs-interop';
import {map} from 'rxjs';
import {DemoApplicationState} from '../demo-state';
import {demoMoney} from '../demo-money';
import {DemoOrderOrigin,DemoIncidentProjectionStep,DemoIncidentState} from './order-types';
import {AuthorizeDemoOrdersStep} from './order-flow';
import {OrderQueueAxis} from './order-query';
import {OrderReturnDestination} from './order-detail-flow';
import {DemoBrowserEffects} from './demo-browser-effects';
import {InventoryReturnComponent} from '../inventory/inventory-return.component';
import {OrderNavigationOrigin} from './order-navigation-origin';
/** Honest read-only continuation outside the canonical operational workflow. */
@Component({selector:'sc-demo-legacy-order-detail',imports:[RouterLink,InventoryReturnComponent],styleUrls:['../demo.scss'],template:`
<section class="page">
@if(!allowed){<h1 #heading tabindex="-1">Acceso denegado</h1><p>Ingresá con una identidad de administración u operador.</p><a routerLink="/demo/login" data-cta="order-detail-login">Ingresar</a>@if(!state.authorizationAvailable){<p role="alert">No se pudo leer el pedido. Los datos guardados requieren revisión.</p><button type="button" data-cta="order-detail-retry-read" (click)="retryRead()">Reintentar lectura</button>}}
@else{<h1 #heading tabindex="-1">Detalle de pedido</h1>
@if(order;as row){<h2>{{row.id}}</h2><p role="status">{{origin.label}}. Consulta de datos simulados; las transiciones de entrega y posventa operativa no están disponibles para este pedido.</p>
<p>Pago: {{row.payment.label}} · Pedido: {{row.status.label}} · Entrega: {{row.shipment.label}}</p><p>Incidencia: {{incident.label}}</p>
<p>Destino registrado: {{row.address || 'Sin destino registrado'}}</p><ul>@for(line of row.lines;track $index){<li>{{line.name}} · {{line.quantity}} × {{money(line.unit)}}</li>}</ul><p>Total registrado: {{money(row.total)}}</p>
<p>No se emite documentación fiscal ni se presume una gestión posventa para este pedido.</p>
<sc-inventory-return/>
}@else{<p>Pedido no disponible. Conservamos el acceso a la cola autorizada.</p>}
<a data-cta="legacy-order-back" [routerLink]="destination.path" [queryParams]="destination.params">{{navigationOrigin.label}}</a>}</section>`})
export class DemoLegacyOrderDetailComponent {
 readonly state=inject(DemoApplicationState);private readonly route=inject(ActivatedRoute);readonly money=demoMoney;private readonly browser=inject(DemoBrowserEffects);
 private readonly router=inject(Router);
 private readonly navigation=this.router.currentNavigation()??this.router.lastSuccessfulNavigation();
 readonly navigationOrigin=OrderNavigationOrigin.fromWire(this.navigation?.trigger==='imperative'&&this.navigation.previousNavigation!==null?this.navigation.extras.state?.['orderOrigin']:undefined);
 readonly id=toSignal(this.route.paramMap.pipe(map(p=>p.get('id')??'')),{initialValue:''});
 readonly query=toSignal(this.route.queryParamMap.pipe(map(p=>Object.fromEntries(['q','focus',...OrderQueueAxis.all.map(a=>a.wire)].map(k=>[k,p.get(k)])))),{initialValue:{}});
 get allowed(){const s=this.state;return new AuthorizeDemoOrdersStep().permits({context:s.context(),role:s.role(),actor:s.actorId(),epoch:s.sessionEpoch(),readable:s.authorizationAvailable});}
 get order(){return this.allowed?this.state.data.orders.find(o=>o.id===this.id())??null:null;}
 retryRead(){this.browser.retryRead();}
 get origin(){return this.order?.origin??DemoOrderOrigin.Unknown;}
 get incident(){return this.order?new DemoIncidentProjectionStep().execute(this.state.data,this.order):DemoIncidentState.Unknown;}
 get destination(){return this.navigationOrigin.destination(this.order?.actor??'',OrderReturnDestination.fromWire(this.query(),this.id()));}
 private readonly heading=viewChild<ElementRef<HTMLElement>>('heading');private focused=false;
 constructor(){afterRenderEffect(()=>{const heading=this.heading();if(heading&&!this.focused){this.focused=true;heading.nativeElement.focus();}});}
}
