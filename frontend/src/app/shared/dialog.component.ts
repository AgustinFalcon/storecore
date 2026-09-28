import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

@Component({
  selector: 'sc-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open) {
      <div class="sc-dialog">
        <button type="button" class="sc-dialog__backdrop" aria-label="Cerrar" (click)="dismissed.emit()"></button>
        <div class="sc-dialog__card" role="dialog" aria-modal="true" aria-labelledby="sc-dialog-title">
          <h2 id="sc-dialog-title">{{ title }}</h2>
          <p>{{ message }}</p>
          <div class="sc-table__actions">
            <button type="button" class="sc-btn sc-btn--ghost" (click)="dismissed.emit()">{{ cancelLabel }}</button>
            <button type="button" class="sc-btn" [class.sc-btn--danger]="danger" [class.sc-btn--primary]="!danger" (click)="confirm.emit()">
              {{ confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class DialogComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() message = '';
  @Input() confirmLabel = 'Confirmar';
  @Input() cancelLabel = 'Cancelar';
  @Input() danger = false;
  @Output() readonly confirm = new EventEmitter<void>();
  @Output() readonly dismissed = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) {
      this.dismissed.emit();
    }
  }
}
