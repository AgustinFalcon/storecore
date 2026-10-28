import { Component, ElementRef, afterRenderEffect, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { DemoApplicationState } from '../demo-state';
import { DemoContext } from '../demo-model';
import { demoMoney } from '../demo-money';
import { DemoResultOutcome } from '../checkout/demo-checkout-result';
import { DemoReturnDestination } from '../identity/demo-return-destination';
import { DemoOrderHistory, OrderHistoryCriteria, OrderHistoryQueryStatus, OrderPaymentFilter } from './demo-order-history';

@Component({ selector:'sc-demo-order-history', imports:[FormsModule,RouterLink], templateUrl:'./demo-order-history.component.html', styleUrls:['../demo.scss','./demo-order-history.component.scss'] })
export class DemoOrderHistoryComponent {
  readonly state = inject(DemoApplicationState);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly presenter = new DemoOrderHistory();
  private readonly heading = viewChild<ElementRef<HTMLElement>>('historyHeading');
  private readonly resultsHeading = viewChild<ElementRef<HTMLElement>>('resultsHeading');
  private focusedActor: string | null = null;
  private readonly pageFocus = signal(0);
  private focusedPage = 0;
  readonly Outcome = DemoResultOutcome;
  readonly QueryStatus = OrderHistoryQueryStatus;
  readonly filters = OrderPaymentFilter.all;
  readonly criteria = toSignal(this.route.queryParamMap.pipe(map(params => OrderHistoryCriteria.fromWire({ q:params.get('q'),payment:params.get('payment'),page:params.get('page') }))), { initialValue:OrderHistoryCriteria.fromWire({}) });
  get allowed(): boolean { return this.state.authorizationAvailable && this.state.context() === DemoContext.Customer; }
  readonly view = computed(() => this.presenter.execute(this.state.data.orders,this.allowed ? DemoContext.Customer : DemoContext.Unknown,this.state.actorId(),this.criteria()));
  get returnQuery(): { returnUrl:string } { return { returnUrl:DemoReturnDestination.fromWire(this.router.url).url }; }
  money(value:number):string { return Number.isSafeInteger(value) && value >= 0 ? demoMoney(value) : 'Importe no disponible'; }
  search(raw:string):void { this.update({ q:raw,payment:this.criteria().payment.wire }); }
  filter(raw:string):void { this.update({ q:this.criteria().search,payment:raw }); }
  clear():void { this.update({}); }
  page(page:number):void { this.pageFocus.update(value=>value+1); this.update({ ...this.criteria().query,page:String(page) }); }
  private update(raw:{ q?:string;payment?:string;page?:string }):void { void this.router.navigate(['/demo/customer/orders'],{ queryParams:OrderHistoryCriteria.fromWire(raw).query,replaceUrl:true }); }
  constructor() {
    afterRenderEffect(() => {
      if (!this.allowed) { this.focusedActor = null; return; }
      const actor = this.state.actorId(), heading = this.heading()?.nativeElement, request = this.pageFocus();
      if (heading && actor !== this.focusedActor) { this.focusedActor = actor; heading.focus(); }
      else if (request !== this.focusedPage) { this.focusedPage = request; if (document.activeElement?.matches('[data-cta="history-next"],[data-cta="history-previous"]')) this.resultsHeading()?.nativeElement.focus(); }
    });
  }
}
