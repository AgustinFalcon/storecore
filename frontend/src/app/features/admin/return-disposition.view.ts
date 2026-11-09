import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DamageReason, DispositionDraftLine, DispositionPhase, RejectionReason, ReturnDispositionLine } from '../../domain/order/return-disposition';
import { ReturnDispositionViewState } from './return-disposition.store';

@Component({
  selector: 'sc-return-disposition-view',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './return-disposition.view.html',
  styles: [`.sc-rma { margin-block: 1.5rem; } .sc-rma__grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr)); } .sc-rma__line { margin-block: 1rem; } .sc-rma__actions { display: flex; gap: .75rem; flex-wrap: wrap; margin-block: 1rem; } .sc-rma__count { font-size: 1.2rem; font-weight: 700; } .sc-rma__meta { color: var(--sc-color-muted-ink); } textarea { min-height: 5rem; width: 100%; }`],
})
export class ReturnDispositionViewComponent {
  @Input({ required: true }) state!: ReturnDispositionViewState;
  @Output() readonly lineChange = new EventEmitter<{ returnItemId: string; patch: Partial<Omit<DispositionDraftLine, 'returnItemId'>> }>();
  @Output() readonly review = new EventEmitter<void>();
  @Output() readonly back = new EventEmitter<void>();
  @Output() readonly confirm = new EventEmitter<void>();
  @Output() readonly recover = new EventEmitter<void>();
  readonly phases = DispositionPhase;
  readonly damageReasons = DamageReason.choices;
  readonly rejectionReasons = RejectionReason.choices;
  draft(line: ReturnDispositionLine): DispositionDraftLine | null { return this.state.draft.find(value => value.returnItemId === line.returnItemId) ?? line.classification; }
  get restockTotal(): number { return this.state.draft.reduce((sum, line) => sum + line.restockQuantity, 0); }
  get damagedTotal(): number { return this.state.draft.reduce((sum, line) => sum + line.damagedQuantity, 0); }
  get rejectedTotal(): number { return this.state.draft.reduce((sum, line) => sum + line.rejectedQuantity, 0); }
}
