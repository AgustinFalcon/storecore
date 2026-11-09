import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { BoundedPageNavigation, boundedPageNavigation } from '../domain/catalog/bounded-page';
import { ListMetadata } from '../domain/catalog/bounded-rows';

@Component({
  selector: 'sc-bounded-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (metadata; as page) {
      <nav class="sc-actions" [attr.aria-label]="label">
        @if (navigation.recoveryPage !== null) {
          <span role="status" aria-live="polite">La lista cambió; recuperando una página disponible…</span>
        } @else {
          <button type="button" class="sc-btn" [attr.aria-disabled]="loading || !navigation.hasPrevious" (click)="go(navigation.page - 1)">Anterior</button>
          <span role="status" aria-live="polite">Página {{ navigation.page + 1 }} de {{ navigation.totalPages }}</span>
          <button type="button" class="sc-btn" [attr.aria-disabled]="loading || !navigation.hasNext" (click)="go(navigation.page + 1)">Siguiente</button>
        }
      </nav>
    }
  `,
})
export class BoundedPaginationComponent {
  @Input() metadata: ListMetadata | null = null;
  @Input() loading = false;
  @Input() label = 'Páginas de resultados';
  @Output() readonly pageChange = new EventEmitter<number>();

  get navigation(): BoundedPageNavigation {
    return this.metadata ? boundedPageNavigation(this.metadata) : {
      page: 0, totalPages: 1, hasPrevious: false, hasNext: false, recoveryPage: null,
    };
  }

  go(page: number): void {
    if (this.loading || !Number.isSafeInteger(page) || page < 0 || page > 10_000) return;
    if (page === this.navigation.page - 1 && !this.navigation.hasPrevious) return;
    if (page === this.navigation.page + 1 && !this.navigation.hasNext) return;
    if (page !== this.navigation.page - 1 && page !== this.navigation.page + 1) return;
    this.pageChange.emit(page);
  }
}

