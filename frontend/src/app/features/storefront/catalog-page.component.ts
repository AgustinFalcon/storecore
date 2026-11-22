import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { BoundedPageRequest } from '../../domain/catalog/bounded-page';
import { CatalogPageViewComponent } from './catalog-page.view';
import { CatalogStore } from './catalog.store';

@Component({
  selector: 'sc-catalog-page',
  imports: [AsyncPipe, CatalogPageViewComponent],
  providers: [CatalogStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-catalog-page-view
        [state]="state"
        (queryChange)="onQuery($event)"
        (brandChange)="onBrand($event)"
        (categoryChange)="onCategory($event)"
        (offersChange)="onOffers($event)"
        (searchSubmit)="applyFilters()"
        (filtersClear)="clearFilters()"
        (pageChange)="store.goToPage($event)"
      />
    }
  `,
})
export class CatalogPageComponent implements OnInit {
  constructor(
    readonly store: CatalogStore,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly destroyRef: DestroyRef,
  ) {}

  ngOnInit(): void {
    this.store.loadFacets();
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.store.setQuery({
        ...this.store.snapshot.query,
        query: params.get('q') ?? '',
        brand: params.get('brand') ?? '',
        category: params.get('category') ?? '',
        offersOnly: params.get('offers') === '1',
        pagination: BoundedPageRequest.first(this.store.snapshot.query.pagination.size),
      });
      this.store.search();
    });
  }

  onQuery(query: string): void {
    this.store.setQuery({ ...this.store.snapshot.query, query });
  }

  onBrand(brand: string): void {
    this.store.setQuery({ ...this.store.snapshot.query, brand });
    this.applyFilters();
  }

  onCategory(category: string): void {
    this.store.setQuery({ ...this.store.snapshot.query, category });
    this.applyFilters();
  }

  onOffers(offersOnly: boolean): void {
    this.store.setQuery({ ...this.store.snapshot.query, offersOnly });
    this.applyFilters();
  }

  applyFilters(): void {
    const query = this.store.snapshot.query;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: query.query.trim() || null,
        brand: query.brand || null,
        category: query.category || null,
        offers: query.offersOnly ? '1' : null,
      },
      replaceUrl: true,
    }).then((navigated) => {
      // Angular skips same-URL navigation. Retry/search and clearing an already
      // clean toolbar must still restore authoritative results.
      if (!navigated) this.store.search();
    });
  }

  clearFilters(): void {
    const size = this.store.snapshot.query.pagination.size;
    this.store.setQuery({ query: '', brand: '', category: '', offersOnly: false, pagination: BoundedPageRequest.first(size) });
    this.applyFilters();
  }
}
