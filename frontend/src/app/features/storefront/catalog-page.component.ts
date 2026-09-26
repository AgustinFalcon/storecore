import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { catalogQueryFromParams, catalogQueryParams, sameCatalogQuery } from '../../domain/catalog/catalog-query.entity';
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
        (searchSubmit)="search()"
      />
    }
  `,
})
export class CatalogPageComponent implements OnInit, OnDestroy {
  private readonly queryParams = new Subscription();

  constructor(
    readonly store: CatalogStore,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.store.loadFacets();
    this.queryParams.add(this.route.queryParamMap.subscribe((params) => this.applyRouteQuery(params)));
  }

  ngOnDestroy(): void {
    this.queryParams.unsubscribe();
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

  search(): void {
    const next = catalogQueryFromParams({
      get: (name) => catalogQueryParams(this.store.snapshot.query)[name] ?? null,
    });
    this.store.setQuery(next);
    if (sameCatalogQuery(next, catalogQueryFromParams(this.route.snapshot.queryParamMap))) {
      this.store.search();
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: catalogQueryParams(next),
    });
  }

  private applyRouteQuery(params: ParamMap): void {
    this.store.setQuery(catalogQueryFromParams(params));
    this.store.search();
  }
}
