import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild, effect, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { UserSession } from '../../core/auth/user-session';
import {
  AdminProductOptionsDraft, ConflictResolutionChoice, OptionAssignmentDraft, OptionAxisDraft, OptionSchemaCommandOperation, OptionValueDraft, VerifiedProductOptionsSnapshot, optionAssignmentValue,
} from '../../domain/catalog/admin-product-options';
import { DomainReadonlyMap, OptionPresentation } from '../../domain/catalog/option-schema';
import { AdminProductOptionsStore } from './admin-product-options.store';
import { distinctUntilChanged, filter, map } from 'rxjs';

@Component({
  selector: 'sc-admin-product-options',
  imports: [AsyncPipe, FormsModule],
  providers: [AdminProductOptionsStore],
  templateUrl: './admin-product-options.component.html',
  styleUrl: './admin-product-options.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminProductOptionsComponent {
  @ViewChild('panelTitle') private panelTitle?: ElementRef<HTMLHeadingElement>;
  @ViewChild('clearTrigger') private clearTrigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('clearConfirm') private clearConfirm?: ElementRef<HTMLButtonElement>;
  readonly presentations = [OptionPresentation.Select, OptionPresentation.Swatch];
  readonly mine = ConflictResolutionChoice.Mine;
  readonly remote = ConflictResolutionChoice.Remote;
  readonly replaceOperation = OptionSchemaCommandOperation.Replace;
  readonly clearOperation = OptionSchemaCommandOperation.Clear;
  private requestedSku = '';
  readonly assignmentQuery = signal('');
  readonly assignmentPage = signal(0);
  readonly assignmentPageSize = 25;
  @Output() readonly verifiedSnapshot = new EventEmitter<VerifiedProductOptionsSnapshot>();

  @Input({ required: true }) set sku(value: string) {
    if (value !== this.requestedSku) this.resetAssignmentNavigation();
    this.requestedSku = value;
    if (value) { this.store.open(value); queueMicrotask(() => this.panelTitle?.nativeElement.focus()); }
  }

  constructor(readonly store: AdminProductOptionsStore, session: UserSession) {
    effect(() => {
      const changed = this.store.setActor(session.authenticated() ? session.principal() : null, session.authenticationEpoch());
      if (changed && this.requestedSku) this.store.open(this.requestedSku, true);
    });
    this.store.state$.pipe(
      map(state => state.sku && state.base ? { sku: state.sku, snapshot: state.base } : null),
      filter((value): value is VerifiedProductOptionsSnapshot => value !== null),
      distinctUntilChanged((left, right) => left.sku === right.sku && left.snapshot.revision === right.snapshot.revision
        && left.snapshot.schema.state === right.snapshot.schema.state),
      takeUntilDestroyed(),
    ).subscribe(value => this.verifiedSnapshot.emit(value));
  }
  open(sku: string): void { if (sku !== this.store.snapshot.sku) this.resetAssignmentNavigation(); this.store.open(sku); }
  private resetAssignmentNavigation(): void { this.assignmentQuery.set(''); this.assignmentPage.set(0); }

  patchAxis(draft: AdminProductOptionsDraft, index: number, partial: Partial<OptionAxisDraft>): void {
    this.store.setDraft({ ...draft, axes: draft.axes.map((axis, current) => current === index ? { ...axis, ...partial } : axis) });
  }
  setPresentation(draft: AdminProductOptionsDraft, index: number, raw: unknown): void {
    const presentation = raw === OptionPresentation.Swatch.wire ? OptionPresentation.Swatch : OptionPresentation.Select;
    const axis = draft.axes[index]; if (!axis) return;
    const values = presentation === OptionPresentation.Select ? axis.values.map(value => ({ ...value, swatchColor: '' })) : axis.values;
    this.patchAxis(draft, index, { presentation, values });
  }
  addAxis(draft: AdminProductOptionsDraft): void {
    if (draft.axes.length >= 4) return;
    let suffix = draft.axes.length + 1, code = `opcion-${suffix}`;
    while (draft.axes.some(axis => axis.code === code)) code = `opcion-${++suffix}`;
    const axis: OptionAxisDraft = { code, label: `Opción ${suffix}`, presentation: OptionPresentation.Select, order: draft.axes.length,
      values: [{ code: 'valor-1', label: 'Valor 1', swatchColor: '', order: 0 }] };
    this.store.setDraft({ ...draft, axes: [...draft.axes, axis] });
  }
  removeAxis(draft: AdminProductOptionsDraft, index: number): void {
    const removed = draft.axes[index]; if (!removed) return;
    const axes = draft.axes.filter((_, current) => current !== index).map((axis, order) => ({ ...axis, order }));
    const assignments = draft.assignments.map(row => ({ ...row, optionValues: new DomainReadonlyMap([...row.optionValues].filter(([key]) => key !== removed.code)) }));
    this.store.setDraft({ ...draft, axes, assignments });
  }
  moveAxis(draft: AdminProductOptionsDraft, index: number, offset: number): void {
    const target = index + offset; if (target < 0 || target >= draft.axes.length) return;
    const axes = [...draft.axes]; [axes[index], axes[target]] = [axes[target], axes[index]];
    this.store.setDraft({ ...draft, axes: axes.map((axis, order) => ({ ...axis, order })) });
  }
  patchValue(draft: AdminProductOptionsDraft, axisIndex: number, valueIndex: number, partial: Partial<OptionValueDraft>): void {
    const axis = draft.axes[axisIndex]; if (!axis) return;
    this.patchAxis(draft, axisIndex, { values: axis.values.map((value, current) => current === valueIndex ? { ...value, ...partial } : value) });
  }
  addValue(draft: AdminProductOptionsDraft, axisIndex: number): void {
    const axis = draft.axes[axisIndex]; if (!axis || axis.values.length >= 50) return;
    let suffix = axis.values.length + 1, code = `valor-${suffix}`; while (axis.values.some(value => value.code === code)) code = `valor-${++suffix}`;
    this.patchAxis(draft, axisIndex, { values: [...axis.values, { code, label: `Valor ${suffix}`, swatchColor: '', order: axis.values.length }] });
  }
  moveValue(draft: AdminProductOptionsDraft, axisIndex: number, valueIndex: number, offset: number): void {
    const axis = draft.axes[axisIndex], target = valueIndex + offset; if (!axis || target < 0 || target >= axis.values.length) return;
    const values = [...axis.values]; [values[valueIndex], values[target]] = [values[target], values[valueIndex]];
    this.patchAxis(draft, axisIndex, { values: values.map((value, order) => ({ ...value, order })) });
  }
  removeValue(draft: AdminProductOptionsDraft, axisIndex: number, valueIndex: number): void {
    const axis = draft.axes[axisIndex], removed = axis?.values[valueIndex]; if (!axis || !removed || axis.values.length === 1) return;
    const axes = draft.axes.map((candidate, current) => current === axisIndex ? { ...candidate, values: candidate.values.filter((_, position) => position !== valueIndex).map((value, order) => ({ ...value, order })) } : candidate);
    const assignments = draft.assignments.map(row => row.optionValues.get(axis.code) === removed.code
      ? { ...row, optionValues: new DomainReadonlyMap([...row.optionValues].filter(([key]) => key !== axis.code)) } : row);
    this.store.setDraft({ ...draft, axes, assignments });
  }
  patchAssignment(draft: AdminProductOptionsDraft, index: number, partial: Partial<OptionAssignmentDraft>): void {
    this.store.setDraft({ ...draft, assignments: draft.assignments.map((row, current) => current === index ? { ...row, ...partial } : row) });
  }
  setAssignmentValue(draft: AdminProductOptionsDraft, index: number, axis: string, value: string): void {
    const row = draft.assignments[index]; if (!row) return;
    const optionValues = new Map(row.optionValues); if (value) optionValues.set(axis, value); else optionValues.delete(axis);
    this.patchAssignment(draft, index, { optionValues: new DomainReadonlyMap(optionValues) });
  }
  addInactive(draft: AdminProductOptionsDraft): void {
    if (!this.canAddInactive(draft)) return;
    this.store.setDraft({ ...draft, pendingAdditions: [...draft.pendingAdditions, { localId: crypto.randomUUID(), sku: '', label: '' }] });
  }
  canAddInactive(draft: AdminProductOptionsDraft): boolean { return draft.assignments.length + draft.pendingAdditions.length < 1000; }
  patchPending(draft: AdminProductOptionsDraft, index: number, partial: { sku?: string; label?: string }): void {
    this.store.setDraft({ ...draft, pendingAdditions: draft.pendingAdditions.map((row, current) => current === index ? { ...row, ...partial } : row) });
  }
  removePending(draft: AdminProductOptionsDraft, index: number): void {
    this.store.setDraft({ ...draft, pendingAdditions: draft.pendingAdditions.filter((_, current) => current !== index) });
  }
  requestClear(): void { this.store.requestClear(); window.setTimeout(() => this.clearConfirm?.nativeElement.focus()); }
  cancelClear(): void { this.store.cancelClear(); window.setTimeout(() => this.clearTrigger?.nativeElement.focus()); }
  visibleAssignments(draft: AdminProductOptionsDraft): readonly { row: OptionAssignmentDraft; index: number }[] {
    const query = this.assignmentQuery().trim().toLocaleLowerCase('es-AR');
    const filtered = draft.assignments.map((row, index) => ({ row, index })).filter(item => !query || item.row.variantSku.toLocaleLowerCase('es-AR').includes(query));
    const start = Math.min(this.assignmentPage() * this.assignmentPageSize, Math.max(0, filtered.length - 1));
    return filtered.slice(start, start + this.assignmentPageSize);
  }
  assignmentCount(draft: AdminProductOptionsDraft): number {
    const query = this.assignmentQuery().trim().toLocaleLowerCase('es-AR');
    return draft.assignments.filter(row => !query || row.variantSku.toLocaleLowerCase('es-AR').includes(query)).length;
  }
  setAssignmentQuery(value: string): void { this.assignmentQuery.set(value); this.assignmentPage.set(0); }
  missingAxes(draft: AdminProductOptionsDraft, row: OptionAssignmentDraft): string {
    if (!row.active) return '';
    return draft.axes.filter(axis => !this.assignmentValue(row, axis.code)).map(axis => axis.label).join(', ');
  }
  duplicateActiveSkus(draft: AdminProductOptionsDraft, row: OptionAssignmentDraft): string {
    if (!draft.axes.length || !row.active || draft.axes.some(axis => !this.assignmentValue(row, axis.code))) return '';
    const key = JSON.stringify(draft.axes.map(axis => this.assignmentValue(row, axis.code)));
    return draft.assignments.filter(candidate => candidate.active && candidate.variantId !== row.variantId
      && !draft.axes.some(axis => !this.assignmentValue(candidate, axis.code))
      && JSON.stringify(draft.axes.map(axis => this.assignmentValue(candidate, axis.code))) === key).map(candidate => candidate.variantSku).join(', ');
  }
  assignmentValue(row: OptionAssignmentDraft, axisCode: string): string {
    return optionAssignmentValue(row, axisCode);
  }
}
