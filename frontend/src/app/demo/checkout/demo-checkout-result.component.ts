import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { DemoApplicationState } from '../demo-state';
import { DemoContext } from '../demo-model';
import { DemoCheckoutResultPresenter } from './demo-checkout-result';
import { demoMoney } from '../demo-money';
import { DemoReturnDestination } from '../identity/demo-return-destination';

@Component({ selector: 'sc-demo-checkout-result', imports: [RouterLink], templateUrl: './demo-checkout-result.component.html', styleUrls: ['../demo.scss', './demo-checkout-result.component.scss'] })
export class DemoCheckoutResultComponent {
  readonly state = inject(DemoApplicationState);
  readonly route = inject(ActivatedRoute);
  private readonly orderId = toSignal(this.route.paramMap.pipe(map(params => params.get('orderId'))), { initialValue: this.route.snapshot.paramMap.get('orderId') });
  private readonly presenter = new DemoCheckoutResultPresenter();
  get allowed(): boolean { return this.state.authorizationAvailable && this.state.context() === DemoContext.Customer; }
  readonly result = computed(() => this.presenter.execute(this.state.data.orders, this.orderId(), this.allowed ? this.state.context() : DemoContext.Unknown, this.state.actorId()));
  get returnQuery(): { returnUrl: string } { return { returnUrl: DemoReturnDestination.fromWire('/demo/checkout/result/'+encodeURIComponent(this.orderId() ?? '')).url }; }
  money(value: number): string { return Number.isSafeInteger(value) && value >= 0 ? demoMoney(value) : 'Importe no disponible'; }
}
