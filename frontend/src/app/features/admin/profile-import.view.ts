import { AfterViewChecked, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProfileImportState } from './profile-import.store';
import { ProfileDiffOperation, ProfileImportPhase, PreviewValidity } from '../../domain/user/profile-import';
import { ProfileConfirmationStep } from '../../domain/user/profile-import-steps';

@Component({
  selector: 'sc-profile-import-view',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-import.view.html',
  styleUrl: './profile-import.view.css',
})
export class ProfileImportViewComponent implements AfterViewChecked, OnDestroy {
  @Input({ required: true }) state!: ProfileImportState;
  @Output() readonly manifestChange = new EventEmitter<string>();
  @Output() readonly preview = new EventEmitter<void>();
  @Output() readonly reviewUncertain = new EventEmitter<void>();
  @Output() readonly merge = new EventEmitter<void>();
  @Output() readonly selectionChange = new EventEmitter<{ key: string; selected: boolean }>();
  @Output() readonly confirm = new EventEmitter<void>();
  @Output() readonly cancelConfirmation = new EventEmitter<void>();
  @ViewChild('confirmation') private confirmation?: ElementRef<HTMLDialogElement>;
  @ViewChild('confirmTrigger') private confirmTrigger?: ElementRef<HTMLButtonElement>;
  readonly phase = ProfileImportPhase;
  readonly validity = PreviewValidity;
  private restoreFocus = false;
  private readonly confirmationStep = new ProfileConfirmationStep();

  get canMerge(): boolean {
    return this.confirmationStep.allows(this.state);
  }
  get totals(): readonly { label: string; count: number }[] {
    return [ProfileDiffOperation.Add, ProfileDiffOperation.Update, ProfileDiffOperation.Unchanged].map((operation) => ({ label: operation.label, count: this.state.review?.changes.filter((row) => row.operation === operation).length ?? 0 }));
  }
  ngAfterViewChecked(): void {
    const dialog = this.confirmation?.nativeElement;
    if (!dialog) return;
    if (this.state.phase === ProfileImportPhase.Confirming && !dialog.open) { dialog.showModal(); this.restoreFocus = true; }
    else if (this.state.phase !== ProfileImportPhase.Confirming && dialog.open) {
      dialog.close();
      if (this.restoreFocus) { this.confirmTrigger?.nativeElement.focus(); this.restoreFocus = false; }
    }
  }
  cancel(event?: Event): void { event?.preventDefault(); this.cancelConfirmation.emit(); }
  containFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const buttons = this.confirmation?.nativeElement.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
    if (!buttons?.length) return;
    const first = buttons[0]; const last = buttons[buttons.length - 1];
    if (event.shiftKey && event.target === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && event.target === last) { event.preventDefault(); first.focus(); }
  }
  ngOnDestroy(): void { this.confirmation?.nativeElement.close(); }
}
