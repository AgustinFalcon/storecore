import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrowserFavorite } from '../../core/favorites/session-favorites';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-customer-favorites-view',
  imports: [RouterLink, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-favorites.view.html',
})
export class CustomerFavoritesViewComponent {
  @Input() entries: readonly BrowserFavorite[] = [];
  @Output() readonly toggle = new EventEmitter<BrowserFavorite>();
}
