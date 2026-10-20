import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CartPageViewComponent } from './cart-page.view';
import { CartStore } from './cart.store';

@Component({
  selector: 'sc-cart-page',
  imports: [AsyncPipe, CartPageViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-cart-page-view [state]="state" [access]="store.authority()" (selectCustomer)="store.selectCustomer()" (quantityChange)="changeQty($event)" (retry)="store.load()" />
    }
  `,
})
export class CartPageComponent implements OnInit {
  constructor(readonly store: CartStore) {}

  ngOnInit(): void {
    this.store.load();
  }

  changeQty(line: { sku: string; quantity: number }): void {
    this.store.add({ sku: line.sku, quantity: line.quantity < 0 ? 0 : line.quantity });
  }
}
