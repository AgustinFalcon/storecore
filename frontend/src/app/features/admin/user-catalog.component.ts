import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { AdminCatalogStore } from './admin-catalog.store';
import { UserCatalogViewComponent } from './user-catalog.view';

@Component({
  selector: 'sc-user-catalog',
  imports: [AsyncPipe, UserCatalogViewComponent],
  providers: [AdminCatalogStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-user-catalog-view
        [state]="state"
        (draftChange)="store.setDraft($event)"
        (brandDraftChange)="store.setBrandDraft($event)"
        (categoryDraftChange)="store.setCategoryDraft($event)"
        (saveProduct)="store.persist()"
        (saveBrand)="store.persistBrand()"
        (saveCategory)="store.persistCategory()"
      />
    }
  `,
})
export class UserCatalogComponent implements OnInit {
  constructor(readonly store: AdminCatalogStore) {}

  ngOnInit(): void {
    this.store.load();
    this.store.loadFacets();
  }
}
