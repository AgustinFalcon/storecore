import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { filter, forkJoin, switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import {
  InventoryRow,
  MercadoLibreAccount,
  MercadoLibreListing,
} from '../../domain/user/user.entity';
import { ManageInstallationUseCase } from '../../domain/user/use-cases/manage-installation.usecase';

export interface InstallationState {
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly inventory: readonly InventoryRow[];
  readonly mlAccount: MercadoLibreAccount | null;
  readonly listings: readonly MercadoLibreListing[];
  readonly listingDraft: MercadoLibreListing;
}

const emptyListing: MercadoLibreListing = { listingId: '', variationId: '', sku: '' };

@Injectable()
export class InstallationStore extends ComponentStore<InstallationState> {
  constructor(private readonly ops: ManageInstallationUseCase) {
    super({
      loading: false,
      errorMessage: '',
      inventory: [],
      mlAccount: null,
      listings: [],
      listingDraft: emptyListing,
    });
  }

  get snapshot(): InstallationState {
    return this.get((s) => s);
  }

  readonly loading$ = this.select((s) => s.loading);
  readonly errorMessage$ = this.select((s) => s.errorMessage);
  readonly inventory$ = this.select((s) => s.inventory);
  readonly mlAccount$ = this.select((s) => s.mlAccount);
  readonly listings$ = this.select((s) => s.listings);
  readonly emptyInventory$ = this.select((s) => !s.loading && s.inventory.length === 0);

  readonly setListingDraft = this.updater((s, listingDraft: MercadoLibreListing) => ({ ...s, listingDraft }));

  readonly loadInventory = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '' })),
      switchMap(() =>
        this.ops.listInventory().pipe(
          tapResponse({
            next: (inventory) => this.patchState({ inventory, loading: false }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly loadMercadoLibre = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '' })),
      switchMap(() =>
        forkJoin({
          mlAccount: this.ops.readMercadoLibreAccount(),
          listings: this.ops.listMercadoLibreListings(),
        }).pipe(
          tapResponse({
            next: (data) => this.patchState({ ...data, loading: false }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly persistListing = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => {
        if (!this.snapshot.listingDraft.listingId.trim() || !this.snapshot.listingDraft.sku.trim()) {
          this.patchState({ errorMessage: 'Listing y SKU son obligatorios.' });
          return;
        }
        this.patchState({ errorMessage: '' });
      }),
      filter(() => Boolean(this.snapshot.listingDraft.listingId.trim() && this.snapshot.listingDraft.sku.trim())),
      switchMap(() =>
        this.ops.saveMercadoLibreListing(this.snapshot.listingDraft).pipe(
          tapResponse({
            next: () => {
              this.patchState({ listingDraft: emptyListing });
              this.loadMercadoLibre();
            },
            error: (err: unknown) => this.patchState({ errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );
}
