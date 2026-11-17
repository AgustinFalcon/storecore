import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest, distinctUntilChanged, map, take } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { CartStore } from '../cart/cart.store';
import { CatalogStore } from './catalog.store';
import { ProductPageViewComponent, ProductPurchaseSelection, ProductSelectionChangeRequest } from './product-page.view';
import { CustomerFavoritesStore } from '../identity/customer-favorites.store';
import { PurchaseIntentCoordinator } from '../../core/purchase-intent/purchase-intent-coordinator';
import { CartLineConfirmationResult, PurchaseIntentResolutionResult, PurchaseIntentStage, RestoredPurchaseAvailability } from '../../domain/purchase-intent/purchase-intent';
import { CustomerSession } from '../../core/auth/customer-session';
import { AccessMutationFence } from '../../core/auth/access-mutation-fence';
import { AccessContext } from '../../domain/access/access-context';
import { ReturnDestination } from '../../domain/access/return-destination';
import { CartLineMutationOutcome, SetCartLineCommand } from '../../domain/cart/cart-line-mutation-outcome';
import { AccessCoordinator } from '../../core/auth/access-coordinator';

@Component({
  selector: 'sc-product-page',
  imports: [AsyncPipe, ProductPageViewComponent],
  providers: [CatalogStore, CustomerFavoritesStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sc-product-page-view
      [product]="store.product$ | async"
      [cart]="cart.cart$ | async"
      [loading]="(store.loading$ | async) ?? false"
      [error]="(store.errorMessage$ | async) || (cart.errorMessage$ | async) || ''"
      [access]="cart.authority()"
      [favorite]="favorites.isFavorite(selectedSku)"
      [favoriteBusy]="((favorites.viewState$ | async)?.mutationSku || '') === selectedSku"
      [favoriteFeedback]="(favorites.selectedMessage$ | async) || ''"
      [restoredSelection]="restoredSelection"
      [intentMessage]="intentMessage"
      [intentCanConfirm]="intentCanConfirm"
      [intentBusy]="intentBusy"
      [selectionBlocked]="selectionBlocked"
      [currentCartQuantity]="intent.snapshot().currentQuantity"
      (selectCustomer)="cart.selectCustomer()"
      (requestAccess)="beginAccess($event)"
      (reviseIntent)="reviseIntent($event)"
      (requestSelectionChange)="authorizeSelectionChange($event)"
      (selectedSkuChange)="selectedSkuChanged($event)"
      (cancelIntent)="cancelIntent()"
      (add)="addToCart($event)"
      (toggleFavorite)="toggleFavorite($event)"
      (retry)="reload()"
    />
  `,
})
export class ProductPageComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private resumeReference: string | null = null;
  private flowFeedback = '';
  private awaitingProductRead = false;
  private observedProductLoading = false;
  private awaitingCartRead = false;
  private observedCartLoading = false;
  private restoredSelectionKey = '';
  private restoredSelectionValue: ProductPurchaseSelection | null = null;
  selectionBlocked = false;
  private requiresFreshIntent = false;
  selectedSku = '';
  constructor(
    readonly store: CatalogStore,
    readonly cart: CartStore,
    readonly favorites: CustomerFavoritesStore,
    readonly intent: PurchaseIntentCoordinator,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly customer: CustomerSession,
    private readonly accessFence: AccessMutationFence,
    private readonly access: AccessCoordinator,
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.resumeReference = this.intent.validatedResumeReference(params.get('resume'));
    });
    this.customer.actorChanges$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.intent.invalidateAuthority());
    this.access.stateChanges$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.intent.invalidateAuthority());
    combineLatest([this.store.viewState$, this.cart.viewState$]).pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(([catalogState, cartState]) => {
      if (catalogState.loading) this.observedProductLoading = this.awaitingProductRead;
      if (cartState.loading) this.observedCartLoading = this.awaitingCartRead;
      if (!catalogState.product || catalogState.loading || cartState.loading || catalogState.errorMessage || cartState.errorMessage
        || !this.resumeReference || !this.cart.authority().canMutate) return;
      if ((this.awaitingProductRead && !this.observedProductLoading) || (this.awaitingCartRead && !this.observedCartLoading)) return;
      this.awaitingProductRead = false;
      this.awaitingCartRead = false;
      this.intent.resumeSelection(this.resumeReference, catalogState.product, cartState.cart, this.actor());
    });
    this.route.paramMap.pipe(
      map((params) => params.get('sku') ?? ''),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((sku) => this.loadProduct(sku));
  }

  get restoredSelection(): ProductPurchaseSelection | null {
    const state = this.intent.snapshot();
    if (!this.hasActiveRouteIntent) {
      this.restoredSelectionKey = '';
      this.restoredSelectionValue = null;
      return null;
    }
    const key = `${state.intent.flowId}:${state.revision}:${state.intent.variantSku}:${state.intent.quantity}`;
    if (key !== this.restoredSelectionKey) {
      this.restoredSelectionKey = key;
      const product = this.store.snapshot.product;
      const variant = product?.variants.find(value => value.sku === state.intent.variantSku);
      const assignment = product?.optionSnapshot?.variants.find(value => value.variantId === variant?.id);
      this.restoredSelectionValue = { variantId: variant?.id ?? '', variantSku: state.intent.variantSku,
        optionValues: assignment?.values ?? new Map(), quantity: state.intent.quantity, revision: state.revision };
    }
    return this.restoredSelectionValue;
  }
  get intentMessage(): string {
    const state = this.intent.snapshot();
    return this.hasActiveRouteIntent ? state.message : this.flowFeedback;
  }
  get intentCanConfirm(): boolean {
    const state = this.intent.snapshot();
    return this.hasActiveRouteIntent && !this.awaitingProductRead && !this.awaitingCartRead
      && state.stage === PurchaseIntentStage.ReadyForConfirmation && state.availability === RestoredPurchaseAvailability.Ready
      && state.confirmation !== CartLineConfirmationResult.Pending;
  }
  get intentBusy(): boolean {
    const state = this.intent.snapshot();
    return this.hasActiveRouteIntent && (this.awaitingProductRead || this.awaitingCartRead
      || state.stage === PurchaseIntentStage.Restoring || state.confirmation === CartLineConfirmationResult.Pending);
  }

  private get hasActiveRouteIntent(): boolean {
    const state = this.intent.snapshot();
    return !!this.resumeReference && state.intent.isKnown && state.intent.flowId === this.resumeReference
      && state.intent.productSku === this.store.snapshot.product?.sku
      && state.stage !== PurchaseIntentStage.Completed && state.stage !== PurchaseIntentStage.Expired;
  }

  reload(): void {
    this.loadProduct(this.route.snapshot.paramMap.get('sku') ?? '');
  }

  private loadProduct(sku: string): void {
    this.refreshProduct(sku);
    if (this.cart.authority().canMutate) {
      this.refreshCart();
      this.favorites.load();
    }
  }

  beginAccess(line: { sku: string; quantity: number }): void {
    const productSku = this.store.snapshot.product?.sku ?? '';
    const state = this.intent.capture(productSku, line.sku, line.quantity);
    if (!state.intent.isKnown) { this.flowFeedback = state.message; return; }
    this.selectionBlocked = false;
    this.requiresFreshIntent = false;
    this.flowFeedback = '';
    this.resumeReference = state.intent.flowId;
    if (this.cart.authority().requiresSelection) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: { resume: this.resumeReference }, queryParamsHandling: 'merge', replaceUrl: true });
      this.awaitingCartRead = true;
      this.observedCartLoading = false;
      this.cart.selectCustomer();
      this.refreshProduct(productSku);
      return;
    }
    void this.router.navigate(['/login'], { queryParams: { returnTo: ReturnDestination.Catalog.wire, resume: this.resumeReference } });
  }

  reviseIntent(line: { sku: string; quantity: number }): void {
    const revised = this.intent.revise(line.sku, line.quantity);
    const productSku = this.store.snapshot.product?.sku;
    if (!revised.intent.isKnown || !productSku || !this.cart.authority().canMutate) return;
    this.resumeReference = revised.intent.flowId;
    this.refreshProduct(productSku);
    this.refreshCart();
  }

  authorizeSelectionChange(request: ProductSelectionChangeRequest): void {
    if (!this.resumeReference) { request.apply(); return; }
    const suspended = this.intent.suspendForSelectionChange(this.resumeReference);
    const urlRetired = this.retireResumeAddress();
    this.resumeReference = null;
    this.requiresFreshIntent = true;
    this.selectionBlocked = !suspended.storageResult.succeeded || !urlRetired;
    this.flowFeedback = suspended.message;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { resume: null }, queryParamsHandling: 'merge', replaceUrl: true });
    if (!this.selectionBlocked) request.apply();
  }

  addToCart(line: { sku: string; quantity: number }): void {
    if (this.selectionBlocked) return;
    if (this.requiresFreshIntent) {
      const captured = this.intent.capture(this.store.snapshot.product?.sku ?? '', line.sku, line.quantity);
      if (!captured.intent.isKnown) { this.selectionBlocked = true; this.flowFeedback = captured.message; return; }
      this.requiresFreshIntent = false;
      this.resumeReference = captured.intent.flowId;
      void this.router.navigate([], { relativeTo: this.route, queryParams: { resume: this.resumeReference }, queryParamsHandling: 'merge', replaceUrl: true });
      this.refreshProduct(captured.intent.productSku);
      this.refreshCart();
      return;
    }
    const state = this.intent.snapshot();
    if (!this.hasActiveRouteIntent) {
      this.cart.add(line);
      return;
    }
    if (state.intent.variantSku !== line.sku || state.intent.quantity !== line.quantity || !this.intentCanConfirm) return;
    const claim = this.intent.beginConfirmation(this.actor());
    if (!claim) return;
    const command: SetCartLineCommand = { ...line, report: (outcome) => {
      if (outcome === CartLineMutationOutcome.Accepted) {
        if (this.intent.markAccepted(claim) !== PurchaseIntentResolutionResult.Applied) return;
        this.flowFeedback = this.intent.snapshot().message;
        this.resumeReference = null;
        void this.router.navigate([], { relativeTo: this.route, queryParams: { resume: null }, queryParamsHandling: 'merge', replaceUrl: true });
        this.cart.load();
      }
      else if (outcome === CartLineMutationOutcome.Rejected) {
        if (this.intent.markRejected(claim) !== PurchaseIntentResolutionResult.Applied) return;
      }
      else if (this.intent.markUnknown(claim) !== PurchaseIntentResolutionResult.Applied) return;
      if (outcome === CartLineMutationOutcome.OutcomeUnknown) {
        const reconciliationFlow = claim.flowId, reconciliationRevision = claim.revision;
        this.access.reconcileRegisteredCustomer().pipe(take(1)).subscribe((accessState) => {
          const current = this.intent.snapshot();
          if (current.intent.flowId !== reconciliationFlow || current.revision !== reconciliationRevision || this.resumeReference !== reconciliationFlow) return;
          if (accessState.activeContext === AccessContext.Customer && accessState.permits(AccessContext.Customer)) this.refreshCart();
          else this.intent.invalidateAuthority();
        });
      } else if (outcome === CartLineMutationOutcome.Rejected) {
        this.refreshCart();
      }
    } };
    this.cart.add(command);
  }

  cancelIntent(): void {
    this.intent.cancel();
    this.flowFeedback = this.intent.snapshot().message;
    this.resumeReference = null;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { resume: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  private actor() {
    return { identity: this.customer.actorIdentity(), revision: this.accessFence.snapshot(AccessContext.Customer), canMutate: this.cart.authority().canMutate };
  }

  private refreshProduct(sku: string): void {
    this.awaitingProductRead = true;
    this.observedProductLoading = false;
    this.store.loadProduct(sku);
  }

  private refreshCart(): void {
    this.awaitingCartRead = true;
    this.observedCartLoading = false;
    this.cart.load();
  }

  toggleFavorite(sku: string): void {
    if (!this.cart.authority().canMutate) return;
    if (this.favorites.isFavorite(sku)) this.favorites.remove(sku);
    else this.favorites.add(sku);
  }
  selectedSkuChanged(sku: string): void {
    this.selectedSku = sku;
    this.favorites.selectSku(sku);
  }

  private retireResumeAddress(): boolean {
    try {
      const current = new URL(globalThis.location.href);
      current.searchParams.delete('resume');
      globalThis.history.replaceState(globalThis.history.state, '', `${current.pathname}${current.search}${current.hash}`);
      return !new URL(globalThis.location.href).searchParams.has('resume');
    } catch { return false; }
  }
}
