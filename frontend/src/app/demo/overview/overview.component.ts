import { Component,ElementRef,afterRenderEffect,computed,inject,viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute,Router,RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { DemoApplicationState } from '../demo-state';
import { demoMoney } from '../demo-money';
import { DemoOrderDate } from '../orders/demo-order-date';
import { DemoOverviewPresenter } from './overview-presenter';
import { OverviewAccess,OverviewAction,OverviewRange } from './overview-types';
import { RefundStatus } from '../aftercare/aftercare-types';

@Component({selector:'sc-demo-overview',imports:[FormsModule,RouterLink],templateUrl:'./overview.component.html',styleUrls:['../demo.scss','./overview.component.scss']})
export class DemoOverviewComponent {
  readonly state=inject(DemoApplicationState);private readonly route=inject(ActivatedRoute);private readonly router=inject(Router);private readonly presenter=new DemoOverviewPresenter();
  readonly reference=DemoOrderDate.fromWire(new Date().toISOString());readonly ranges=OverviewRange.all;readonly Action=OverviewAction;readonly Access=OverviewAccess;readonly Range=OverviewRange;readonly Refund=RefundStatus;
  readonly range=toSignal(this.route.queryParamMap.pipe(map(params=>params.has('range')?OverviewRange.fromWire(params.get('range')):OverviewRange.All)),{initialValue:OverviewRange.All});
  readonly access=computed(()=>OverviewAccess.resolve(this.state.context(),this.state.role(),this.state.authorizationAvailable));
  readonly view=computed(()=>this.presenter.execute(this.state.data,{context:this.state.context(),role:this.state.role(),readable:this.state.authorizationAvailable},this.range(),this.reference));
  private readonly heading=viewChild<ElementRef<HTMLElement>>('overviewHeading');private focusedKey='';
  private readonly aftercareHeading=viewChild<ElementRef<HTMLElement>>('aftercareHeading');
  showAftercare():void{const heading=this.aftercareHeading()?.nativeElement;heading?.focus();heading?.scrollIntoView({block:'start'});}
  changeRange(raw:string):void{const range=OverviewRange.fromWire(raw);void this.router.navigate([],{relativeTo:this.route,queryParams:{range:range.wire},replaceUrl:false});}
  resetRange():void{this.changeRange(OverviewRange.All.wire);}
  money(value:number|null):string{return value===null?'Importe no disponible':demoMoney(value);}
  constructor(){afterRenderEffect(()=>{const key=this.state.sessionEpoch()+':'+this.state.context().wire+':'+this.state.role().wire+':'+this.access().label,heading=this.heading()?.nativeElement;if(heading&&key!==this.focusedKey){this.focusedKey=key;heading.focus();}});}
}
