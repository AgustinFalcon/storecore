import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FeatureStatusComponent } from '../../shared/feature-status.component';
import { CustomerFavoritesStore } from './customer-favorites.store';

@Component({
  selector: 'sc-customer-favorites',
  imports: [AsyncPipe, RouterLink, FeatureStatusComponent],
  providers: [CustomerFavoritesStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-favorites.component.html',
})
export class CustomerFavoritesComponent implements OnInit {
  constructor(readonly store: CustomerFavoritesStore) {}
  ngOnInit(): void { this.store.load(); }
}
