import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, EventEmitter, inject, Input, OnChanges, Output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminOrder } from '../../domain/order/order.entity';
import { RmaStatus } from '../../domain/order/commerce-states';
import { ReturnDispositionStore } from './return-disposition.store';
import { ReturnDispositionViewComponent } from './return-disposition.view';

@Component({
  selector: 'sc-return-disposition',
  imports: [AsyncPipe, ReturnDispositionViewComponent],
  providers: [ReturnDispositionStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (visible) { @if (store.vm$ | async; as state) { <sc-return-disposition-view [state]="state" (lineChange)="store.change($event.returnItemId, $event.patch)" (review)="store.review()" (back)="store.back()" (confirm)="store.confirm()" (recover)="store.recover()" /> } }`,
})
export class ReturnDispositionComponent implements OnChanges {
  @Input() order: AdminOrder | null = null;
  @Output() readonly dispositionConfirmed = new EventEmitter<void>();
  private readonly destroyRef = inject(DestroyRef);
  constructor(readonly store: ReturnDispositionStore) {
    this.store.confirmed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.dispositionConfirmed.emit());
  }
  get visible(): boolean { return this.order !== null && [RmaStatus.ReturnReceived, RmaStatus.Inspected, RmaStatus.Closed, RmaStatus.Unknown].includes(this.order.rmaStatus); }
  ngOnChanges(): void { if (this.order && this.visible) this.store.load(this.order.id); else this.store.reset(); }
}
