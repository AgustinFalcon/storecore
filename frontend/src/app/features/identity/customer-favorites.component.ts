import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FavoritesBrowserStore } from '../../core/favorites/favorites-browser.store';
import { CustomerFavoritesViewComponent } from './customer-favorites.view';

@Component({
  selector: 'sc-customer-favorites',
  imports: [CustomerFavoritesViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sc-customer-favorites-view
      [entries]="favorites.list()"
      (remove)="favorites.toggle($event)"
    />
  `,
})
export class CustomerFavoritesComponent {
  constructor(readonly favorites: FavoritesBrowserStore) {}
}
