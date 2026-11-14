import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, ViewChild, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CapabilityFilter } from '../../domain/user/capability-filter';
import { ModuleAvailability } from '../../domain/user/module-availability';
import { CapabilityReadState } from './capability-read-state';
import { CommercialCapabilityCard, CommercialCapabilityId, commercialCapabilityCards } from './user-capabilities.catalog';
import { UserCapabilitiesState } from './user-capabilities.store';
import { CapabilityModule } from '../../domain/user/user.entity';
import { CapabilityModuleState } from '../../domain/user/capability-module-state';
import { CapabilityStateIntent } from '../../domain/user/capability-state-intent';

@Component({
  selector: 'sc-user-capabilities-view',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-capabilities.view.html',
  styleUrl: './user-capabilities.view.scss',
})
export class UserCapabilitiesViewComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) state!: UserCapabilitiesState;
  @Output() readonly refresh = new EventEmitter<void>();
  @Output() readonly queryChange = new EventEmitter<string>();
  @Output() readonly filterChange = new EventEmitter<CapabilityFilter>();
  @Output() readonly clearFilters = new EventEmitter<void>();
  @Output() readonly editModule = new EventEmitter<CapabilityModule>();
  @Output() readonly draftChange = new EventEmitter<{ target?: CapabilityModuleState; reason?: string }>();
  @Output() readonly confirmChange = new EventEmitter<void>();
  @Output() readonly closeEditor = new EventEmitter<void>();
  @ViewChild('editorDialog') private editorDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('targetSelect') private targetSelect?: ElementRef<HTMLSelectElement>;
  @ViewChild('pageHeading') private pageHeading?: ElementRef<HTMLHeadingElement>;
  private editorTrigger: HTMLElement | null = null;
  private editorTimer: ReturnType<typeof setTimeout> | null = null;
  canEdit(row: CapabilityModule): boolean { return this.state.canMutate && CapabilityStateIntent.canEdit(row); }
  get canConfirm(): boolean {
    const draft = this.state.draft;
    return !!draft && this.state.canMutate && !this.state.loading && !this.state.mutationLocked && !this.state.phase.isSaving
      && draft.reviewedVersion && CapabilityStateIntent.isValid(draft.row, draft.target, draft.reason);
  }
  openEditor(row: CapabilityModule, event: Event): void {
    this.editorTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.editModule.emit(row);
  }
  cancelEditor(event?: Event): void {
    event?.preventDefault();
    if (!this.state.phase.isSaving) this.closeEditor.emit();
  }
  @ViewChild('informationDialog') private informationDialog?: ElementRef<HTMLDialogElement>;

  readonly filters = CapabilityFilter.values;
  readonly unknownTarget = CapabilityModuleState.Unknown;
  private readonly activeCardId = signal<CommercialCapabilityId | null>(null);
  private focusBeforeDialog: HTMLElement | null = null;
  private dialogOpenTimer: ReturnType<typeof setTimeout> | null = null;

  get cards(): readonly CommercialCapabilityCard[] { return commercialCapabilityCards(this.state.modules); }
  get visibleCards(): readonly CommercialCapabilityCard[] {
    const query = normalize(this.state.query);
    return this.cards.filter((card) => {
      const textMatches = !query || [card.name, card.category, card.summary].some((value) => normalize(value).includes(query));
      const stateMatches = this.state.filter === CapabilityFilter.All
        || (card.serverModule !== null && this.state.filter.matches(card.serverModule));
      return textMatches && stateMatches;
    });
  }
  get availableCount(): number { return this.cards.filter((card) => card.availability === ModuleAvailability.Available).length; }
  get pendingCount(): number { return this.cards.length - this.availableCount; }
  get unknownReadState(): boolean { return this.state.readState === CapabilityReadState.Unknown; }
  activeCard(): CommercialCapabilityCard | null {
    const id = this.activeCardId();
    if (id === null || !this.state.hasSnapshot || this.state.readState.isAccessDenied || this.unknownReadState) return null;
    return this.cards.find((card) => card.id === id) ?? null;
  }

  ngOnChanges(): void {
    const editor = this.editorDialog?.nativeElement;
    if (this.state.draft && !editor?.open && this.editorTimer === null) {
      this.editorTimer = setTimeout(() => {
        this.editorTimer = null;
        if (!this.state.draft) return;
        const dialog = this.editorDialog?.nativeElement;
        if (dialog && !dialog.open) { dialog.showModal(); this.targetSelect?.nativeElement.focus(); }
      });
    } else if (!this.state.draft && editor?.open) {
      editor.close();
      const trigger = this.editorTrigger;
      this.editorTimer = setTimeout(() => {
        this.editorTimer = null;
        if (this.state.draft) return;
        if (this.state.readState.isAccessDenied || !this.state.canMutate) this.pageHeading?.nativeElement.focus();
        else if (trigger?.isConnected && !(trigger instanceof HTMLButtonElement && trigger.disabled)) trigger.focus();
        else this.pageHeading?.nativeElement.focus();
      });
      this.editorTrigger = null;
    }
    if (this.activeCardId() === null || this.activeCard() !== null) return;
    if (this.informationDialog?.nativeElement.open) this.informationDialog.nativeElement.close();
    else this.restoreDialogFocus();
  }

  ngOnDestroy(): void {
    if (this.editorTimer !== null) clearTimeout(this.editorTimer);
    this.cancelPendingDialogOpen();
    this.activeCardId.set(null);
    this.focusBeforeDialog = null;
  }

  openInformation(card: CommercialCapabilityCard, event: Event): void {
    this.cancelPendingDialogOpen();
    this.focusBeforeDialog = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.activeCardId.set(card.id);
    this.dialogOpenTimer = setTimeout(() => {
      this.dialogOpenTimer = null;
      const dialog = this.informationDialog?.nativeElement;
      if (this.activeCard() !== null && dialog && !dialog.open) dialog.showModal();
    });
  }

  closeInformation(): void {
    this.cancelPendingDialogOpen();
    const dialog = this.informationDialog?.nativeElement;
    if (dialog?.open) dialog.close();
    else this.restoreDialogFocus();
  }
  restoreDialogFocus(): void {
    this.cancelPendingDialogOpen();
    this.activeCardId.set(null);
    this.focusBeforeDialog?.focus();
    this.focusBeforeDialog = null;
  }

  private cancelPendingDialogOpen(): void {
    if (this.dialogOpenTimer === null) return;
    clearTimeout(this.dialogOpenTimer);
    this.dialogOpenTimer = null;
  }
}

function normalize(value: string): string {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR');
}
