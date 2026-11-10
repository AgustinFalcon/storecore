import { AsyncPipe, DatePipe, DecimalPipe } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, inject, Injector, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CreateOfferCommand, DiscountKind, Offer, OfferStatus, OfferTransition } from '../../domain/offer/offer';
import { UserOffersStore } from './user-offers.store';

interface OfferDraft {
  name: string; priority: number; startsAt: string; endsAt: string; discountKind: DiscountKind;
  discountValue: number; minMarginPercent: number; skus: string;
}

function initialDraft(): OfferDraft {
  const start = new Date();
  start.setMinutes(start.getMinutes() - start.getTimezoneOffset());
  const end = new Date(start); end.setDate(end.getDate() + 7);
  return { name: '', priority: 0, startsAt: start.toISOString().slice(0, 16), endsAt: end.toISOString().slice(0, 16), discountKind: DiscountKind.Percent, discountValue: 10, minMarginPercent: 0, skus: '' };
}

@Component({
  selector: 'sc-user-offers',
  imports: [AsyncPipe, DatePipe, DecimalPipe, FormsModule],
  providers: [UserOffersStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-offers.component.html',
})
export class UserOffersComponent implements OnInit {
  readonly draft = signal<OfferDraft>(initialDraft());
  readonly formError = signal('');
  readonly pendingTransition = signal<{ offer: Offer; transition: OfferTransition } | null>(null);
  readonly query = signal('');
  readonly statusFilter = signal<OfferStatus | null>(null);
  readonly kinds = DiscountKind.selectable;
  readonly statuses = [OfferStatus.Draft, OfferStatus.Active, OfferStatus.Paused, OfferStatus.Ended];
  readonly unknownStatus = OfferStatus.Unknown;
  readonly unknownKind = DiscountKind.Unknown;
  private readonly injector = inject(Injector);
  private readonly transitionDialog = viewChild<ElementRef<HTMLDialogElement>>('transitionDialog');
  private transitionTrigger: HTMLElement | null = null;
  constructor(readonly store: UserOffersStore) {}
  ngOnInit(): void { this.store.load(); }
  patch(partial: Partial<OfferDraft>): void { this.draft.update((draft) => ({ ...draft, ...partial })); }
  transitions(offer: Offer): readonly OfferTransition[] { return OfferTransition.forOffer(offer); }
  requestTransition(offer: Offer, transition: OfferTransition, event: Event): void {
    if (!OfferTransition.forOffer(offer).includes(transition)) return;
    this.transitionTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.pendingTransition.set({ offer, transition });
    afterNextRender(() => {
      const dialog = this.transitionDialog()?.nativeElement;
      if (!dialog?.open) dialog?.showModal();
      dialog?.querySelector<HTMLElement>('[data-confirm-transition]')?.focus();
    }, { injector: this.injector });
  }
  cancelTransition(): void {
    this.transitionDialog()?.nativeElement.close();
    this.pendingTransition.set(null);
    this.transitionTrigger?.focus();
    this.transitionTrigger = null;
  }
  confirmTransition(): void {
    const pending = this.pendingTransition();
    if (!pending) return;
    this.transitionDialog()?.nativeElement.close();
    this.pendingTransition.set(null);
    this.store.transition(pending);
    this.transitionTrigger?.focus();
    this.transitionTrigger = null;
  }
  visible(offer: { name: string; skus: readonly string[]; status: OfferStatus }): boolean {
    const query = this.query().trim().toLocaleLowerCase();
    return (this.statusFilter() === null || offer.status === this.statusFilter())
      && (!query || offer.name.toLocaleLowerCase().includes(query) || offer.skus.some((sku) => sku.toLocaleLowerCase().includes(query)));
  }
  visibleOffers(offers: readonly Offer[]): readonly Offer[] { return offers.filter((offer) => this.visible(offer)); }
  clearFilters(): void { this.query.set(''); this.statusFilter.set(null); }
  submit(): void {
    this.formError.set('');
    const draft = this.draft();
    const skus = [...new Set(draft.skus.split(/[\s,;]+/).map((sku) => sku.trim()).filter(Boolean))];
    const startsAt = new Date(draft.startsAt); const endsAt = new Date(draft.endsAt);
    const kind = draft.discountKind;
    if (!draft.name.trim() || !skus.length || Number.isNaN(startsAt.valueOf()) || Number.isNaN(endsAt.valueOf())) {
      this.formError.set('Completá el nombre, la vigencia y al menos un SKU.'); return;
    }
    if (endsAt <= startsAt) { this.formError.set('La fecha de finalización debe ser posterior al inicio.'); return; }
    if (kind === DiscountKind.Unknown || !Number.isFinite(+draft.discountValue) || +draft.discountValue <= 0
      || kind === DiscountKind.Percent && +draft.discountValue > 100) {
      this.formError.set('Ingresá un descuento válido para el tipo seleccionado.'); return;
    }
    if (!Number.isInteger(+draft.priority) || +draft.priority < 0) { this.formError.set('La prioridad debe ser un entero igual o mayor que cero.'); return; }
    const command: CreateOfferCommand = {
      name: draft.name.trim(), priority: Number(draft.priority), startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(),
      discountKind: kind, discountValue: Number(draft.discountValue),
      minMarginPercent: Number(draft.minMarginPercent), skus,
    };
    this.store.create(command);
  }
}
