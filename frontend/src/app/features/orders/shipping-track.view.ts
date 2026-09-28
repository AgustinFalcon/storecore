import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FeatureStatusComponent } from '../../shared/feature-status.component';
import { LocationMapComponent } from '../cart/location-map.component';
import { ShippingTrackState } from './shipping-track.store';

@Component({
  selector: 'sc-shipping-track-view',
  imports: [RouterLink, FeatureStatusComponent, LocationMapComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shipping-track.view.html',
})
export class ShippingTrackViewComponent {
  @Input({ required: true }) state!: ShippingTrackState;
  @Output() readonly advance = new EventEmitter<void>();
  @Output() readonly retry = new EventEmitter<void>();
}
