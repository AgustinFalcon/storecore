import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { OptionPresentation, OptionResolutionCause, OptionSelectionState, OptionValueAvailability } from '../../domain/catalog/option-schema';
import { SelectOptionAxisComponent } from './select-option-axis.component';
import { SwatchOptionAxisComponent } from './swatch-option-axis.component';

export interface OptionChoiceView {
  readonly code: string;
  readonly label: string;
  readonly availability: OptionValueAvailability;
  readonly cause: OptionResolutionCause | null;
  readonly swatchColor: string | null;
}

export interface OptionAxisView {
  readonly code: string;
  readonly label: string;
  readonly order: number;
  readonly presentation: OptionPresentation;
  readonly selectedValue: string | null;
  readonly choices: readonly OptionChoiceView[];
}

@Component({
  selector: 'sc-product-option-selector',
  imports: [SelectOptionAxisComponent, SwatchOptionAxisComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sc-option-selector" aria-label="Opciones del producto">
      @for (axis of axes; track axis.code) {
        @if (isSelect(axis.presentation)) {
          <sc-select-option-axis [axis]="axis" [disabled]="disabled" (choose)="choose.emit({ axisCode: axis.code, valueCode: $event })" />
        } @else if (isSwatch(axis.presentation)) {
          <sc-swatch-option-axis [axis]="axis" [disabled]="disabled" (choose)="choose.emit({ axisCode: axis.code, valueCode: $event })" />
        }
      }
      @if (selectionState === unknownState || selectionCause === unknownCause) {
        <div class="sc-notice" role="status">
          <p>{{ selectionCause?.label || selectionState.label }}</p>
          <button type="button" class="sc-btn sc-btn--ghost" (click)="retry.emit()">Reintentar opciones</button>
        </div>
      } @else if (selectionState !== completeState) {
        <p class="sc-option-selector__status" role="status">{{ selectionCause?.label || selectionState.label }}</p>
      }
    </section>
  `,
})
export class ProductOptionSelectorComponent {
  @Input() axes: readonly OptionAxisView[] = [];
  @Input() selectionState = OptionSelectionState.Unknown;
  @Input() selectionCause: OptionResolutionCause | null = OptionResolutionCause.Unknown;
  @Input() disabled = false;
  @Output() readonly choose = new EventEmitter<{ axisCode: string; valueCode: string }>();
  @Output() readonly retry = new EventEmitter<void>();
  readonly completeState = OptionSelectionState.Complete;
  readonly unknownState = OptionSelectionState.Unknown;
  readonly unknownCause = OptionResolutionCause.Unknown;
  isSelect(value: OptionPresentation): boolean { return value === OptionPresentation.Select; }
  isSwatch(value: OptionPresentation): boolean { return value === OptionPresentation.Swatch; }
}
