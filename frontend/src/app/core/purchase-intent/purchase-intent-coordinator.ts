import { Inject, Injectable, InjectionToken, signal } from '@angular/core';
import { Cart } from '../../domain/cart/cart.entity';
import { ProductDetail } from '../../domain/catalog/product-detail.entity';
import { CartLineConfirmationResult, PurchaseIntent, PurchaseIntentStage, RestoredPurchaseAvailability, validPurchaseFlowId } from '../../domain/purchase-intent/purchase-intent';
import { ClockPort, OpaqueIdPort, PurchaseIntentStoragePort, PurchaseIntentStorageResult } from '../../domain/purchase-intent/purchase-intent-storage.port';
import { CapturePurchaseIntentStep, CompletePurchaseIntentStep, PersistPurchaseIntentStep, RestoreExactSelectionStep } from '../../domain/purchase-intent/purchase-intent-steps';
import { SessionPurchaseIntentStorageAdapter } from '../../data/purchase-intent/session-purchase-intent-storage.adapter';

export const PURCHASE_INTENT_STORAGE = new InjectionToken<PurchaseIntentStoragePort>('PurchaseIntentStorage', { providedIn: 'root', factory: () => new SessionPurchaseIntentStorageAdapter() });
export const PURCHASE_INTENT_CLOCK = new InjectionToken<ClockPort>('PurchaseIntentClock', { providedIn: 'root', factory: () => ({ now: () => Date.now() }) });
export const PURCHASE_INTENT_IDS = new InjectionToken<OpaqueIdPort>('PurchaseIntentIds', { providedIn: 'root', factory: () => ({ next: () => globalThis.crypto.randomUUID() }) });

export interface PurchaseIntentActor { readonly identity: string | null; readonly revision: number; readonly canMutate: boolean; }
export interface PurchaseIntentClaim { readonly flowId: string; readonly generation: number; readonly revision: number; readonly actor: PurchaseIntentActor; }
export interface PurchaseIntentSnapshot {
  readonly intent: PurchaseIntent;
  readonly stage: PurchaseIntentStage;
  readonly availability: RestoredPurchaseAvailability;
  readonly confirmation: CartLineConfirmationResult;
  readonly revision: number;
  readonly currentQuantity: number;
  readonly storageResult: PurchaseIntentStorageResult;
  readonly message: string;
}
const initial = (): PurchaseIntentSnapshot => ({ intent: PurchaseIntent.Unknown, stage: PurchaseIntentStage.Unknown, availability: RestoredPurchaseAvailability.Unknown,
  confirmation: CartLineConfirmationResult.Idle, revision: 0, currentQuantity: 0, storageResult: PurchaseIntentStorageResult.Empty, message: '' });

/** Owns a tab's claims. HTTP remains in feature stores; these commands never issue a cart mutation. */
@Injectable({ providedIn: 'root' })
export class PurchaseIntentCoordinator {
  private readonly state = signal<PurchaseIntentSnapshot>(initial());
  readonly snapshot = this.state.asReadonly();
  private generation = 0;
  private claimValue: PurchaseIntentClaim | null = null;
  private pending: PurchaseIntentClaim | null = null;
  private closeAfterPending = false;
  private readonly terminal = new Set<string>();
  constructor(@Inject(PURCHASE_INTENT_STORAGE) private readonly storage: PurchaseIntentStoragePort,
    @Inject(PURCHASE_INTENT_CLOCK) private readonly clock: ClockPort,
    @Inject(PURCHASE_INTENT_IDS) private readonly ids: OpaqueIdPort) {}

  capture(productSku: string, variantSku: string, quantity: number): PurchaseIntentSnapshot {
    if (this.pending) return this.snapshot();
    const old = this.snapshot().intent;
    if (old.isKnown) { this.terminal.add(old.flowId); new CompletePurchaseIntentStep(this.storage).execute(old); }
    this.invalidateAuthority();
    let intent: PurchaseIntent;
    try { intent = new CapturePurchaseIntentStep(this.clock, this.ids).execute(productSku, variantSku, quantity); }
    catch { intent = PurchaseIntent.Unknown; }
    const storageResult = intent.isKnown ? new PersistPurchaseIntentStep(this.storage).execute(intent) : PurchaseIntentStorageResult.Unknown;
    this.state.set({ ...initial(), intent: storageResult.succeeded ? intent : PurchaseIntent.Unknown,
      stage: storageResult.succeeded && intent.isKnown ? PurchaseIntentStage.AwaitingCustomer : PurchaseIntentStage.Unknown,
      storageResult, message: storageResult.label });
    return this.snapshot();
  }

  validatedResumeReference(raw: unknown): string | null { return this.continuationForCustomer(raw)?.flowId ?? null; }
  continuationForCustomer(raw: unknown): { productSku: string; flowId: string } | null {
    if (!validPurchaseFlowId(raw) || this.terminal.has(raw)) return null;
    if (this.snapshot().intent.flowId === raw && !this.snapshot().storageResult.succeeded) return null;
    const loaded = this.storage.load(this.clock.now());
    return loaded.intent.isKnown && loaded.intent.flowId === raw ? { productSku: loaded.intent.productSku, flowId: raw } : null;
  }

  claim(rawResume: unknown, actor: PurchaseIntentActor): PurchaseIntentClaim | null {
    if (this.pending || !actor.canMutate || !actor.identity || !this.validatedResumeReference(rawResume)) return null;
    const intent = this.storage.load(this.clock.now()).intent;
    if (!intent.isKnown || intent.flowId !== rawResume) return null;
    const previous = this.snapshot();
    const same = previous.intent.flowId === intent.flowId;
    const claim: PurchaseIntentClaim = Object.freeze({ flowId: intent.flowId, generation: ++this.generation, revision: same ? previous.revision : 0, actor: Object.freeze({ ...actor }) });
    this.claimValue = claim;
    this.state.set({ ...initial(), intent, revision: claim.revision, stage: PurchaseIntentStage.Restoring,
      confirmation: same ? previous.confirmation : CartLineConfirmationResult.Idle });
    return claim;
  }

  restore(claim: PurchaseIntentClaim, product: ProductDetail | null, cart: Cart): PurchaseIntentSnapshot {
    if (!this.accepts(claim) || this.pending) return this.snapshot();
    if (this.expire()) return this.snapshot();
    const step = new RestoreExactSelectionStep();
    const availability = step.execute(this.snapshot().intent, product);
    this.state.update(state => ({ ...state, availability, stage: availability === RestoredPurchaseAvailability.Ready ? PurchaseIntentStage.ReadyForConfirmation : PurchaseIntentStage.Unavailable,
      currentQuantity: step.currentQuantity(state.intent, cart), message: availability === RestoredPurchaseAvailability.Ready ? PurchaseIntentStage.ReadyForConfirmation.label : availability.label }));
    return this.snapshot();
  }

  resumeSelection(raw: unknown, product: ProductDetail | null, cart: Cart, actor: PurchaseIntentActor): PurchaseIntentSnapshot {
    const claim = this.claim(raw, actor); return claim ? this.restore(claim, product, cart) : this.snapshot();
  }

  revise(variantSku: string, quantity: number): PurchaseIntentSnapshot {
    if (this.pending || this.snapshot().stage === PurchaseIntentStage.Completed || this.expire()) return this.snapshot();
    const intent = this.snapshot().intent.revise(variantSku, quantity, this.clock.now());
    if (!intent.isKnown) return this.snapshot();
    const result = this.storage.save(intent);
    this.invalidateAuthority();
    this.state.update(state => ({ ...state, intent, revision: state.revision + 1, stage: result.succeeded ? PurchaseIntentStage.Restoring : PurchaseIntentStage.Unavailable,
      availability: RestoredPurchaseAvailability.Unknown, confirmation: CartLineConfirmationResult.Idle, storageResult: result, message: result.label }));
    return this.snapshot();
  }

  beginConfirmation(actor: PurchaseIntentActor): PurchaseIntentClaim | null {
    if (this.pending || this.expire() || this.snapshot().stage !== PurchaseIntentStage.ReadyForConfirmation || !this.claimValue
      || !this.accepts(this.claimValue) || !actor.canMutate || !actor.identity || actor.identity !== this.claimValue.actor.identity || actor.revision !== this.claimValue.actor.revision) return null;
    this.pending = this.claimValue;
    this.state.update(state => ({ ...state, confirmation: CartLineConfirmationResult.Pending, message: CartLineConfirmationResult.Pending.label }));
    return this.pending;
  }

  markAccepted(claim: PurchaseIntentClaim): void { this.resolve(claim, CartLineConfirmationResult.Accepted); }
  markRejected(claim: PurchaseIntentClaim): void { this.resolve(claim, CartLineConfirmationResult.Rejected); }
  markUnknown(claim: PurchaseIntentClaim): void { this.resolve(claim, CartLineConfirmationResult.OutcomeUnknown); }
  cancel(): void {
    if (this.pending) { this.closeAfterPending = true; return; }
    this.close(PurchaseIntentStage.Completed, 'Selección cancelada');
  }
  invalidateAuthority(): void {
    ++this.generation;
    this.claimValue = null;
    if (!this.pending) return;
    // The caller may unsubscribe its HTTP observer when CUSTOMER changes. The
    // server effect remains ambiguous, but a detached observer must not lock the
    // tab forever or let a late response publish for the newly selected actor.
    this.pending = null;
    this.state.update(state => ({ ...state, stage: PurchaseIntentStage.Restoring,
      availability: RestoredPurchaseAvailability.Unknown, confirmation: CartLineConfirmationResult.OutcomeUnknown,
      message: CartLineConfirmationResult.OutcomeUnknown.label }));
    const close = this.closeAfterPending;
    this.closeAfterPending = false;
    if (close) this.close(PurchaseIntentStage.Completed, CartLineConfirmationResult.OutcomeUnknown.label);
  }
  accepts(claim: PurchaseIntentClaim): boolean { return claim === this.claimValue && claim.generation === this.generation && claim.revision === this.snapshot().revision && claim.flowId === this.snapshot().intent.flowId && !this.terminal.has(claim.flowId); }

  private resolve(claim: PurchaseIntentClaim, result: CartLineConfirmationResult): void {
    if (claim !== this.pending) return;
    this.pending = null;
    if (result === CartLineConfirmationResult.Accepted) {
      // Acceptance is terminal before storage or refresh can fail.
      this.state.update(state => ({ ...state, stage: PurchaseIntentStage.Completed, confirmation: result, message: result.label }));
      this.close(PurchaseIntentStage.Completed, result.label);
    } else if (this.closeAfterPending) {
      this.state.update(state => ({ ...state, confirmation: result }));
      this.close(PurchaseIntentStage.Completed, result.label);
    }
    else if (this.accepts(claim)) {
      this.invalidateAuthority();
      this.state.update(state => ({ ...state, stage: PurchaseIntentStage.Restoring, availability: RestoredPurchaseAvailability.Unknown, confirmation: result, message: result.label }));
    }
    this.closeAfterPending = false;
  }
  private expire(): boolean {
    if (!this.snapshot().intent.isKnown) return true;
    if (this.pending || !this.snapshot().intent.expired(this.clock.now())) return false;
    this.close(PurchaseIntentStage.Expired, PurchaseIntentStage.Expired.label); return true;
  }
  private close(stage: PurchaseIntentStage, message: string): void {
    const intent = this.snapshot().intent;
    if (intent.isKnown) this.terminal.add(intent.flowId);
    this.invalidateAuthority();
    this.state.update(state => ({ ...state, stage, availability: RestoredPurchaseAvailability.Unknown, message }));
    const storageResult = intent.isKnown ? new CompletePurchaseIntentStep(this.storage).execute(intent) : PurchaseIntentStorageResult.Empty;
    this.state.update(state => ({ ...state, storageResult, message: storageResult.succeeded ? message : `${message}. ${storageResult.label}` }));
  }
}
