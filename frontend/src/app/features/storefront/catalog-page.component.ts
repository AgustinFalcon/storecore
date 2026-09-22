import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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
        (searchSubmit)="store.search()"
      />
    }
  `,
})
export class CatalogPageComponent implements OnInit {
  constructor(
    readonly store: CatalogStore,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.store.setQuery({
      ...this.store.snapshot.query,
      query: params.get('q') ?? '',
      brand: params.get('brand') ?? '',
      category: params.get('category') ?? '',
      offersOnly: params.get('offers') === '1',
    });
    this.store.loadFacets();
    this.store.search();
  }

  onQuery(query: string): void {
    this.store.setQuery({ ...this.store.snapshot.query, query });
  }

  onBrand(brand: string): void {
    this.store.setQuery({ ...this.store.snapshot.query, brand });
  }

  onCategory(category: string): void {
    this.store.setQuery({ ...this.store.snapshot.query, category });
  }

  onOffers(offersOnly: boolean): void {
    this.store.setQuery({ ...this.store.snapshot.query, offersOnly });
  }
}
