import { UserSession } from '../../core/auth/user-session';
import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect } from '@angular/core';
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
        (editError)="store.setEditError($event)"
        (brandDraftChange)="store.setBrandDraft($event)"
        (categoryDraftChange)="store.setCategoryDraft($event)"
        (saveProduct)="store.persist()"
        (saveBrand)="store.persistBrand()"
        (saveCategory)="store.persistCategory()"
        (retry)="reload()"
        (pageChange)="store.goToPage($event)"
      />
    }
  `,
})
export class UserCatalogComponent  {
  constructor(readonly store: AdminCatalogStore, session: UserSession) {
    effect(() => {
      const changed = store.setActor(session.authenticated() ? session.principal() : null);
      if (changed) this.reload();
    });
  }

  reload(): void {
    this.store.load();
    this.store.loadFacets();
  }
}
