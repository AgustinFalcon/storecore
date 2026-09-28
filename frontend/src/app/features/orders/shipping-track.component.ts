import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ShippingTrackStore } from './shipping-track.store';
import { ShippingTrackViewComponent } from './shipping-track.view';

@Component({
  selector: 'sc-shipping-track',
  imports: [AsyncPipe, ShippingTrackViewComponent],
  providers: [ShippingTrackStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-shipping-track-view [state]="state" (advance)="store.advance()" (retry)="reload()" />
    }
  `,
})
export class ShippingTrackComponent implements OnInit {
  constructor(
    readonly store: ShippingTrackStore,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.store.load(this.route.snapshot.paramMap.get('id') ?? '');
  }
}
