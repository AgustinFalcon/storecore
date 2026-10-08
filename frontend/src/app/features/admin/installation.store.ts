import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { defer, EMPTY, exhaustMap, filter, finalize, forkJoin, switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import {
  CapabilityModule,
  CapabilityChange,
  InventoryRow,
  MercadoLibreAccount,
  MercadoLibreListing,
} from '../../domain/user/user.entity';
import { CapabilityReconciliationError, ManageInstallationUseCase } from '../../domain/user/use-cases/manage-installation.usecase';

export interface InstallationState {
  readonly changingCapability: boolean;
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly capabilities: readonly CapabilityModule[];
  readonly inventory: readonly InventoryRow[];
  readonly mlAccount: MercadoLibreAccount | null;
  readonly listings: readonly MercadoLibreListing[];
  readonly listingDraft: MercadoLibreListing;
}

const emptyListing: MercadoLibreListing = { listingId: '', variationId: '', sku: '', accountId: null };

@Injectable()
export class InstallationStore extends ComponentStore<InstallationState> {
  constructor(private readonly ops: ManageInstallationUseCase) {
    super({
      changingCapability: false,
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
  readonly changingCapability$ = this.select((s) => s.changingCapability);
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

  readonly changeCapability = this.effect<CapabilityChange>((cmd$) =>
    cmd$.pipe(
      exhaustMap((cmd) =>
        defer(() => {
          const current = this.snapshot.capabilities.find((item) => item.module === cmd.module);
          if (!current || current.configVersion === null) {
            this.patchState({ errorMessage: 'Recargá la configuración antes de cambiar el estado.' });
            return EMPTY;
          }
          this.patchState({ errorMessage: '', changingCapability: true });
          return this.ops.setCapability(current, cmd.state, cmd.reason);
        }).pipe(
          tapResponse({
            next: (updated) => {
              this.patchState({ capabilities: this.snapshot.capabilities.map((item) => item.module === updated.module ? updated : item) });
              this.loadCapabilities();
            },
            error: (err: unknown) => {
              if (err instanceof CapabilityReconciliationError) {
                this.patchState({ capabilities: err.snapshot });
              } else {
                // A failed readback cannot authorize another write from the old version.
                this.patchState({ capabilities: this.snapshot.capabilities.map(item => ({ ...item, configVersion: null })) });
              }
              this.patchState({ errorMessage: getApiErrorMessage(err) });
            },
          }),
          finalize(() => this.patchState({ changingCapability: false })),
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
        if (!this.snapshot.listingDraft.listingId.trim() || !this.snapshot.listingDraft.sku.trim() || !this.snapshot.listingDraft.accountId) {
          this.patchState({ errorMessage: 'Listing, SKU y account id son obligatorios.' });
          return;
        }
        this.patchState({ errorMessage: '' });
      }),
      filter(() => Boolean(this.snapshot.listingDraft.listingId.trim() && this.snapshot.listingDraft.sku.trim() && this.snapshot.listingDraft.accountId)),
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
