import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { filter, forkJoin, switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import {
  CapabilityModule,
  CapabilityState,
  InventoryRow,
  MercadoLibreAccount,
  MercadoLibreListing,
} from '../../domain/user/user.entity';
import { ManageInstallationUseCase } from '../../domain/user/use-cases/manage-installation.usecase';

export interface InstallationState {
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly capabilities: readonly CapabilityModule[];
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
      capabilities: [],
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
  readonly capabilities$ = this.select((s) => s.capabilities);
  readonly inventory$ = this.select((s) => s.inventory);
  readonly mlAccount$ = this.select((s) => s.mlAccount);
  readonly listings$ = this.select((s) => s.listings);
  readonly emptyCapabilities$ = this.select((s) => !s.loading && s.capabilities.length === 0);
  readonly emptyInventory$ = this.select((s) => !s.loading && s.inventory.length === 0);

  readonly setListingDraft = this.updater((s, listingDraft: MercadoLibreListing) => ({ ...s, listingDraft }));

  readonly loadCapabilities = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '' })),
      switchMap(() =>
        this.ops.listCapabilities().pipe(
          tapResponse({
            next: (capabilities) => this.patchState({ capabilities, loading: false }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly changeCapability = this.effect<{ module: string; state: CapabilityState }>((cmd$) =>
    cmd$.pipe(
      switchMap((cmd) =>
        this.ops.setCapability(cmd.module, cmd.state).pipe(
          tapResponse({
            next: () => this.loadCapabilities(),
            error: (err: unknown) => this.patchState({ errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

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
