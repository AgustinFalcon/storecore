import { UserSession } from '../../core/auth/user-session';
import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ViewChild, effect, signal } from '@angular/core';
import { AdminCatalogStore } from './admin-catalog.store';
import { UserCatalogViewComponent } from './user-catalog.view';
import { AdminProductOptionsComponent } from './admin-product-options.component';

@Component({
  selector: 'sc-user-catalog',
  imports: [AsyncPipe, UserCatalogViewComponent, AdminProductOptionsComponent],
  providers: [AdminCatalogStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-user-catalog-view
        [state]="state"
        (draftChange)="store.setDraft($event)"
        (createProduct)="store.beginCreate()"
        (editProduct)="store.beginEdit($event)"
        (editOptions)="openOptions($event)"
        (editError)="store.setEditError($event)"
        (brandDraftChange)="store.setBrandDraft($event)"
        (categoryDraftChange)="store.setCategoryDraft($event)"
        (saveProduct)="store.persist()"
        (saveBrand)="store.persistBrand()"
        (saveCategory)="store.persistCategory()"
        (retry)="reload()"
        (pageChange)="store.goToPage($event)"
        (queryChange)="store.setQuery($event)"
        (searchSubmit)="store.load()"
      />
      @if (optionsSku(); as sku) { <sc-admin-product-options [sku]="sku" (verifiedSnapshot)="store.syncOptionSnapshot($event)" /> }
    }
  `,
})
export class UserCatalogComponent  {
  @ViewChild(AdminProductOptionsComponent) private optionsEditor?: AdminProductOptionsComponent;
  readonly optionsSku = signal('');
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
  openOptions(sku: string): void {
    if (this.optionsSku() === sku && this.optionsEditor) this.optionsEditor.open(sku);
    else this.optionsSku.set(sku);
  }
}
