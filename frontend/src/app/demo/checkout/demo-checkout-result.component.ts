import { Component, ElementRef, afterRenderEffect, computed, inject, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { DemoApplicationState } from '../demo-state';
import { DemoContext } from '../demo-model';
import { DemoCheckoutResultPresenter, DemoResultOutcome } from './demo-checkout-result';
import { demoMoney } from '../demo-money';
import { DemoReturnDestination } from '../identity/demo-return-destination';
import { CatalogLineFactsComponent } from '../rich-catalog/catalog-line-facts.component';

@Component({ selector: 'sc-demo-checkout-result', imports: [RouterLink,CatalogLineFactsComponent], templateUrl: './demo-checkout-result.component.html', styleUrls: ['../demo.scss', './demo-checkout-result.component.scss'] })
export class DemoCheckoutResultComponent {
  readonly state = inject(DemoApplicationState);
  readonly route = inject(ActivatedRoute);
  private readonly orderId = toSignal(this.route.paramMap.pipe(map(params => params.get('orderId'))), { initialValue: this.route.snapshot.paramMap.get('orderId') });
  private readonly presenter = new DemoCheckoutResultPresenter();
  private readonly heading = viewChild<ElementRef<HTMLElement>>('resultHeading');
  private focusedResult: { readonly id: string | null; readonly outcome: DemoResultOutcome } | null = null;
  get allowed(): boolean { return this.state.authorizationAvailable && this.state.context() === DemoContext.Customer; }
  readonly result = computed(() => this.presenter.execute(this.state.data.orders, this.orderId(), this.allowed ? this.state.context() : DemoContext.Unknown, this.state.actorId()));
  get returnQuery(): { returnUrl: string } { return { returnUrl: DemoReturnDestination.fromWire('/demo/checkout/result/'+encodeURIComponent(this.orderId() ?? '')).url }; }
  money(value: number): string { return Number.isSafeInteger(value) && value >= 0 ? demoMoney(value) : 'Importe no disponible'; }
  constructor() {
    afterRenderEffect(() => {
      if (!this.allowed) { this.focusedResult = null; return; }
      const id = this.orderId(), outcome = this.result().outcome, heading = this.heading()?.nativeElement;
      if (!heading || (this.focusedResult?.id === id && this.focusedResult.outcome === outcome)) return;
      this.focusedResult = { id, outcome };
      heading.focus();
    });
  }
}
