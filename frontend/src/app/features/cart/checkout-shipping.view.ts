import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { coverageFor, Coverage } from '../../domain/shipping/shipping-coverage';
import { shippingPrice } from '../../domain/shipping/shipping-quote';
import { ShippingOptionId } from '../../domain/shipping/shipping.entity';
import { FeatureStatusComponent } from '../../shared/feature-status.component';
import { LocationMapComponent } from './location-map.component';
import { CheckoutShippingState } from './checkout-shipping.store';

@Component({
  selector: 'sc-checkout-shipping-view',
  imports: [RouterLink, FeatureStatusComponent, LocationMapComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './checkout-shipping.view.html',
})
export class CheckoutShippingViewComponent {
  @Input({ required: true }) state!: CheckoutShippingState;
  @Output() readonly choose = new EventEmitter<ShippingOptionId>();
  @Output() readonly pin = new EventEmitter<{ latitude: number; longitude: number }>();
  @Output() readonly retry = new EventEmitter<void>();

  get selectedPrice(): number {
    return shippingPrice(this.state.cartTotal, this.state.selectedId);
  }

  get payable(): number {
    return this.state.cartTotal + this.selectedPrice;
  }

  get canContinue(): boolean {
    return Boolean(this.state.lineCount > 0 && this.state.selectedId && this.state.addressLabel && this.selectedCoverage?.ok);
  }

  get continueHint(): string {
    if (this.state.lineCount < 1) {
      return 'El carrito no tiene líneas.';
    }
    if (!this.state.addressLabel) {
      return 'Falta la dirección de entrega.';
    }
    return 'Falta la ubicación o está fuera de la cobertura simulada.';
  }

  coverage(optionId: ShippingOptionId): Coverage {
    return coverageFor(
      optionId,
      { latitude: this.state.latitude, longitude: this.state.longitude },
      { latitude: this.state.originLatitude, longitude: this.state.originLongitude },
    );
  }

  get selectedCoverage(): Coverage | null {
    return this.state.selectedId ? this.coverage(this.state.selectedId) : null;
  }
}
