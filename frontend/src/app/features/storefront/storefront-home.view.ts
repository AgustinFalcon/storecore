import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CatalogFacet } from '../../domain/catalog/catalog-facet.entity';
import { HomeComposition } from '../../domain/content/home-composition';
import { ProductSummary } from '../../domain/catalog/product-summary.entity';
import { FeatureStatusComponent } from '../../shared/feature-status.component';
import { HomeBlocksComponent } from '../../shared/home-blocks.component';
@Component({
  selector: 'sc-storefront-home-view',
  imports: [FeatureStatusComponent, HomeBlocksComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './storefront-home.view.html',
})
export class StorefrontHomeViewComponent {
  @Input() home: HomeComposition | null = null;
  @Input() offers: readonly ProductSummary[] = [];
  @Input() categories: readonly CatalogFacet[] = [];
  @Input() loading = false;
  @Input() error = '';
  @Output() readonly retry = new EventEmitter<void>();
  get homeEmpty(): boolean { return !this.loading && !this.error && !this.home?.sections.some(section => section.active && section.kind.known); }
}
