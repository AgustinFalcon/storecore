import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogState } from './catalog.store';
import { FeatureStatusComponent } from '../../shared/feature-status.component';
import { ProductTileComponent } from '../../shared/product-tile.component';

@Component({
  selector: 'sc-catalog-page-view',
  imports: [FormsModule, FeatureStatusComponent, ProductTileComponent, BoundedPaginationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './catalog-page.view.html',
})
export class CatalogPageViewComponent {
  @Input({ required: true }) state!: CatalogState;
  @Output() readonly pageChange = new EventEmitter<number>();
  @Output() readonly queryChange = new EventEmitter<string>();
  @Output() readonly brandChange = new EventEmitter<string>();
  @Output() readonly categoryChange = new EventEmitter<string>();
  @Output() readonly offersChange = new EventEmitter<boolean>();
  @Output() readonly searchSubmit = new EventEmitter<void>();
}
import { BoundedPaginationComponent } from '../../shared/bounded-pagination.component';
