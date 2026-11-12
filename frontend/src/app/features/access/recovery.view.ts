import { AfterViewChecked, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthenticateRecoveredRealm, RecoveryOutcome, RecoveryRealm, RecoveryStage } from '../../domain/access/recovery';
import { ReturnDestination } from '../../domain/access/return-destination';
import { RecoveryViewState } from './recovery.store';

@Component({
  selector: 'sc-recovery-view', imports: [FormsModule, RouterLink], changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './recovery.view.html',
})
export class RecoveryViewComponent implements AfterViewChecked {
  @Input({ required: true }) state!: RecoveryViewState;
  @Input() reset = false;
  @Input() destination = ReturnDestination.Home;
  @Output() realmChange = new EventEmitter<string>();
  @Output() emailChange = new EventEmitter<string>();
  @Output() passwordChange = new EventEmitter<string>();
  @Output() confirmationChange = new EventEmitter<string>();
  @Output() submitForm = new EventEmitter<void>();
  @Output() retryRequest = new EventEmitter<void>();
  readonly realms = RecoveryRealm.all;
  readonly stages = RecoveryStage;
  readonly outcomes = RecoveryOutcome;
  @ViewChild('errorSummary') private errorSummary?: ElementRef<HTMLElement>;
  @ViewChild('resultHeading') private resultHeading?: ElementRef<HTMLElement>;
  private previousError = '';
  private previousOutcome: RecoveryOutcome | null = null;
  get loginQuery(): Record<string, string> {
    const intent = AuthenticateRecoveredRealm.forRealm(this.reset ? this.state.realm : RecoveryRealm.Unknown);
    return { returnTo: this.destination.wire, ...(intent.active ? { recoveredRealm: intent.realm.wire } : {}) };
  }
  ngAfterViewChecked(): void {
    if (this.state.error && this.state.error !== this.previousError) this.errorSummary?.nativeElement.focus();
    else if (this.state.outcome !== this.previousOutcome && this.state.outcome?.terminal) this.resultHeading?.nativeElement.focus();
    this.previousError = this.state.error;
    this.previousOutcome = this.state.outcome;
  }
}
