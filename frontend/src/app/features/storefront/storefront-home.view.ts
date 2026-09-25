import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, OnDestroy, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogFacet } from '../../domain/catalog/catalog-facet.entity';
import { HomeBlock, HomeContent } from '../../domain/catalog/home-content.entity';
import { ProductSummary } from '../../domain/catalog/product-summary.entity';
import { FeatureStatusComponent } from '../../shared/feature-status.component';
import { ProductTileComponent } from '../../shared/product-tile.component';

@Component({
  selector: 'sc-storefront-home-view',
  imports: [RouterLink, FeatureStatusComponent, ProductTileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './storefront-home.view.html',
})
export class StorefrontHomeViewComponent implements OnChanges, OnDestroy {
  @Input() home: HomeContent | null = null;
  @Input() offers: readonly ProductSummary[] = [];
  @Input() categories: readonly CatalogFacet[] = [];
  @Input() loading = false;
  @Input() error = '';
  @Output() readonly retry = new EventEmitter<void>();

  slide = 0;
  private timer: ReturnType<typeof setInterval> | undefined;

  get carouselSlides(): readonly HomeBlock[] {
    const blocks = this.home?.blocks ?? [];
    return blocks.length ? blocks.slice(0, 5) : [];
  }

  get homeEmpty(): boolean {
    return !this.loading && !this.error && this.carouselSlides.length === 0 && this.offers.length === 0 && this.categories.length === 0;
  }

  ngOnChanges(): void {
    this.go(this.slide);
    this.play();
  }

  ngOnDestroy(): void {
    this.pause();
  }

  play(): void {
    this.pause();
    if (
      this.carouselSlides.length < 2 ||
      (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    ) {
      return;
    }
    this.timer = setInterval(() => this.go(this.slide + 1), 6000);
  }

  pause(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  go(index: number): void {
    const total = this.carouselSlides.length;
    this.slide = total ? ((index % total) + total) % total : 0;
  }
}
