import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

export interface GenericVariantChoice {
  readonly id: string;
  readonly sku: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly reason: string;
}

@Component({
  selector: 'sc-generic-variant-selector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (choices.length > 1) {
      <label class="sc-option-axis">
        <span class="sc-option-axis__label">Variante</span>
        <select name="variant" [disabled]="disabled" [value]="selectedId" (change)="select($event)">
          <option value="" disabled [selected]="!selectedId">Elegí una variante</option>
          @for (choice of choices; track choice.id) {
            <option [value]="choice.id" [selected]="choice.id === selectedId" [disabled]="!choice.enabled">
              {{ choice.label }} · SKU {{ choice.sku }}{{ choice.enabled ? '' : ' — ' + choice.reason }}
            </option>
          }
        </select>
      </label>
    }
  `,
})
export class GenericVariantSelectorComponent {
  @Input() choices: readonly GenericVariantChoice[] = [];
  @Input() selectedId = '';
  @Input() disabled = false;
  @Output() readonly choose = new EventEmitter<string>();
  select(value: unknown): void {
    const target = value instanceof Event ? value.target as HTMLSelectElement | null : null;
    const id = target?.value ?? value;
    if (typeof id !== 'string') return;
    const choice = this.choices.find(candidate => candidate.id === id);
    if (choice?.enabled) this.choose.emit(choice.id);
    queueMicrotask(() => { if (target) target.value = this.selectedId; });
  }
}
