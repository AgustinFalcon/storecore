import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { OptionAxisView } from './product-option-selector.component';

@Component({
  selector: 'sc-select-option-axis',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sc-option-axis">
      <label class="sc-option-axis__label" [for]="controlId">{{ axis.label }}</label>
      <select [id]="controlId" [name]="controlName" [attr.aria-describedby]="disabledSummary ? helpId : null" [disabled]="disabled" [value]="axis.selectedValue || ''" (change)="select($event)">
        <option value="" disabled [selected]="!axis.selectedValue">Elegí {{ axis.label }}</option>
        @for (choice of axis.choices; track choice.code) {
          <option [value]="choice.code" [selected]="choice.code === axis.selectedValue" [disabled]="!choice.availability.enabled">
            {{ choice.label }}{{ choice.availability.enabled ? '' : ' — ' + (choice.cause?.label || choice.availability.label) }}
          </option>
        }
      </select>
      @if (disabledSummary) { <p [id]="helpId" class="sc-option-axis__help">{{ disabledSummary }}</p> }
    </div>
  `,
})
export class SelectOptionAxisComponent {
  @Input({ required: true }) axis!: OptionAxisView;
  @Input() disabled = false;
  @Output() readonly choose = new EventEmitter<string>();
  get controlName(): string { return `option-axis-${this.axis.order}`; }
  get controlId(): string { return `${this.controlName}-control`; }
  get helpId(): string { return `${this.controlName}-help`; }
  get disabledSummary(): string {
    const disabled = this.axis.choices.filter(choice => !choice.availability.enabled);
    return disabled.length ? disabled.map(choice => `${choice.label}: ${choice.cause?.label ?? choice.availability.label}`).join('. ') : '';
  }
  select(value: unknown): void {
    const target = value instanceof Event ? value.target as HTMLSelectElement | null : null;
    const code = target?.value ?? value;
    if (typeof code !== 'string') return;
    const choice = this.axis.choices.find(candidate => candidate.code === code);
    if (choice?.availability.enabled) this.choose.emit(code);
    queueMicrotask(() => { if (target) target.value = this.axis.selectedValue ?? ''; });
  }
}
