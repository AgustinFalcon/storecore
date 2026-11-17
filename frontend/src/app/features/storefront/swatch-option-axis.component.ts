import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { OptionAxisView } from './product-option-selector.component';

@Component({
  selector: 'sc-swatch-option-axis',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="sc-option-axis sc-option-axis--swatch">
      <legend class="sc-option-axis__label">{{ axis.label }}</legend>
      <div class="sc-swatches">
        @for (choice of axis.choices; track choice.code) {
          <label class="sc-swatch" [class.is-selected]="choice.code === axis.selectedValue" [class.is-disabled]="!choice.availability.enabled">
            <input type="radio" [name]="groupName" [value]="choice.code" [checked]="choice.code === axis.selectedValue"
              [disabled]="disabled || !choice.availability.enabled" (change)="chooseValue(choice.code, $event)" />
            @if (choice.swatchColor) { <span class="sc-swatch__color" [style.--sc-swatch-color]="choice.swatchColor" aria-hidden="true"></span> }
            <span class="sc-swatch__text">{{ choice.label }}</span>
            @if (!choice.availability.enabled) {
              <span class="sc-swatch__reason">{{ choice.cause?.label || choice.availability.label }}</span>
            }
          </label>
        }
      </div>
    </fieldset>
  `,
})
export class SwatchOptionAxisComponent {
  @Input({ required: true }) axis!: OptionAxisView;
  @Input() disabled = false;
  @Output() readonly choose = new EventEmitter<string>();
  get groupName(): string { return `option-axis-${this.axis.order}`; }
  chooseValue(code: string, event?: Event): void {
    const choice = this.axis.choices.find(candidate => candidate.code === code);
    if (choice?.availability.enabled) this.choose.emit(code);
    const target = event?.target as HTMLInputElement | null;
    queueMicrotask(() => target?.closest('fieldset')?.querySelectorAll<HTMLInputElement>('input[type=radio]').forEach(input => {
      input.checked = input.value === this.axis.selectedValue;
    }));
  }
}
