import { HttpErrorResponse } from '@angular/common/http';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AdminProductOptionsMapper, OptionEditorPhase } from '../../domain/catalog/admin-product-options';
import { ProductOptionsWriteResult } from '../../domain/catalog/admin-product-options';
import { ManageProductOptionsUseCase } from '../../domain/catalog/product-options.repository';
import { UserRole } from '../../domain/user/user-role';
import { AdminProductOptionsStore, verifiedOptionsSnapshot } from './admin-product-options.store';

const projection = (revision: number, label = 'Color') => AdminProductOptionsMapper.fromWire({ revision, state: 'VALID', cause: null,
  axes: [{ code: 'color', label, presentation: 'SELECT', order: 0, values: [{ code: 'red', label: 'Rojo', order: 0, swatchColor: null }] }],
  assignments: [{ variantId: '1', variantSku: 'SKU-1', active: true, optionValues: { color: 'red' } }] });

describe('AdminProductOptionsStore', () => {
  it('preserves base and draft, performs one read and zero automatic rewrites after 409', () => {
    const firstRead = new Subject<ReturnType<typeof projection>>(), conflictRead = new Subject<ReturnType<typeof projection>>(), write = new Subject<ProductOptionsWriteResult>();
    const manager = { read: vi.fn().mockReturnValueOnce(firstRead).mockReturnValueOnce(conflictRead), write: vi.fn().mockReturnValue(write) } as unknown as ManageProductOptionsUseCase;
    const store = new AdminProductOptionsStore(manager);
    store.setActor({ id: 'admin', roles: [UserRole.Admin] }, 'epoch-1'); store.open('PRODUCT'); firstRead.next(projection(1));
    const draft = store.snapshot.draft!; store.setDraft({ ...draft, axes: [{ ...draft.axes[0], label: 'Color local' }] }); store.save();
    write.error(new HttpErrorResponse({ status: 409, error: { errorCode: 'CATALOG_OPTION_REVISION_CONFLICT' } }));
    expect(store.snapshot.verificationUnknown).toBe(true);
    expect(verifiedOptionsSnapshot(store.snapshot)?.revision).toBe(1);
    conflictRead.next(projection(2, 'Color remoto'));
    expect(store.snapshot.phase).toBe(OptionEditorPhase.Conflict);
    expect(store.snapshot.base?.revision).toBe(1); expect(store.snapshot.remote?.revision).toBe(2);
    expect(store.snapshot.draft?.axes[0].label).toBe('Color local'); expect(manager.write).toHaveBeenCalledTimes(1); expect(manager.read).toHaveBeenCalledTimes(2);
    expect(verifiedOptionsSnapshot(store.snapshot)?.revision).toBe(2);
    store.ngOnDestroy();
  });

  it('treats a transport failure as unknown outcome and never resends automatically', () => {
    const read = new Subject<ReturnType<typeof projection>>(), write = new Subject<ProductOptionsWriteResult>();
    const manager = { read: vi.fn().mockReturnValue(read), write: vi.fn().mockReturnValue(write) } as unknown as ManageProductOptionsUseCase;
    const store = new AdminProductOptionsStore(manager);
    store.setActor({ id: 'admin', roles: [UserRole.Admin] }, 'epoch-1'); store.open('PRODUCT'); read.next(projection(1)); store.save();
    write.error(new HttpErrorResponse({ status: 0 }));
    const draft = store.snapshot.draft!; store.setDraft({ ...draft, axes: [{ ...draft.axes[0], label: 'No debe entrar' }] }); store.save();
    expect(store.snapshot.phase).toBe(OptionEditorPhase.OutcomeUnknown); expect(store.snapshot.draft?.axes[0].label).toBe('Color'); expect(manager.write).toHaveBeenCalledTimes(1);
    store.ngOnDestroy();
  });

  it('requires explicit clear confirmation and keeps an unverifiable post-write read blocked', () => {
    const initial = new Subject<ReturnType<typeof projection>>(), afterWrite = new Subject<ReturnType<typeof projection>>(), write = new Subject<ProductOptionsWriteResult>();
    const manager = { read: vi.fn().mockReturnValueOnce(initial).mockReturnValueOnce(afterWrite), write: vi.fn().mockReturnValue(write) } as unknown as ManageProductOptionsUseCase;
    const store = new AdminProductOptionsStore(manager);
    store.setActor({ id: 'admin', roles: [UserRole.Admin] }, 'epoch-1'); store.open('PRODUCT'); initial.next(projection(1));
    store.requestClear(); expect(store.snapshot.clearPending).toBe(true); expect(manager.write).not.toHaveBeenCalled(); store.confirmClear();
    expect(manager.write).toHaveBeenCalledTimes(1); write.next({ revision: 2, state: projection(2).schema.state });
    afterWrite.next(AdminProductOptionsMapper.fromWire({ revision: 2, state: 'FUTURE', axes: [], assignments: [] }));
    expect(store.snapshot.phase).toBe(OptionEditorPhase.RefreshRequired); expect(store.snapshot.draft?.axes).toHaveLength(1);
    expect(verifiedOptionsSnapshot(store.snapshot)?.schema.state.wire).toBe('UNKNOWN');
    store.save(); expect(manager.write).toHaveBeenCalledTimes(1); store.ngOnDestroy();
  });

  it('rejects a post-write read below the acknowledged highwater and recovers at that revision', () => {
    const initial = new Subject<ReturnType<typeof projection>>(), stale = new Subject<ReturnType<typeof projection>>(), recovered = new Subject<ReturnType<typeof projection>>(), write = new Subject<ProductOptionsWriteResult>();
    const manager = { read: vi.fn().mockReturnValueOnce(initial).mockReturnValueOnce(stale).mockReturnValueOnce(recovered), write: vi.fn().mockReturnValue(write) } as unknown as ManageProductOptionsUseCase;
    const store = new AdminProductOptionsStore(manager);
    store.setActor({ id: 'admin', roles: [UserRole.Admin] }, 'epoch-1'); store.open('PRODUCT'); initial.next(projection(1)); store.save();
    write.next({ revision: 2, state: projection(2).schema.state });
    expect(store.snapshot.phase).toBe(OptionEditorPhase.Loading);
    store.refresh();
    expect(manager.read).toHaveBeenCalledTimes(2);
    stale.next(projection(1));
    expect(store.snapshot.phase).toBe(OptionEditorPhase.RefreshRequired);
    expect(store.snapshot.verificationUnknown).toBe(true);
    expect(store.snapshot.base?.revision).toBe(1);
    store.refresh(); recovered.next(projection(2));
    expect(store.snapshot.phase).toBe(OptionEditorPhase.Success);
    expect(store.snapshot.verificationUnknown).toBe(false);
    store.ngOnDestroy();
  });

  it('keeps authority unknown when the conflict read fails after 409', () => {
    const initial = new Subject<ReturnType<typeof projection>>(), conflictRead = new Subject<ReturnType<typeof projection>>(), write = new Subject<ProductOptionsWriteResult>();
    const manager = { read: vi.fn().mockReturnValueOnce(initial).mockReturnValueOnce(conflictRead), write: vi.fn().mockReturnValue(write) } as unknown as ManageProductOptionsUseCase;
    const store = new AdminProductOptionsStore(manager);
    store.setActor({ id: 'admin', roles: [UserRole.Admin] }, 'epoch-1'); store.open('PRODUCT'); initial.next(projection(1)); store.save();
    write.error(new HttpErrorResponse({ status: 409 })); conflictRead.error(new Error('offline'));
    expect(store.snapshot.phase).toBe(OptionEditorPhase.ConflictReadRequired);
    expect(store.snapshot.verificationUnknown).toBe(true);
    store.ngOnDestroy();
  });

  it('detects and preserves a Map-only assignment edit until it is reverted explicitly', () => {
    const initial = new Subject<ReturnType<typeof projection>>(), reload = new Subject<ReturnType<typeof projection>>();
    const manager = { read: vi.fn().mockReturnValueOnce(initial).mockReturnValueOnce(reload), write: vi.fn() } as unknown as ManageProductOptionsUseCase;
    const store = new AdminProductOptionsStore(manager);
    store.setActor({ id: 'admin', roles: [UserRole.Admin] }, 'epoch-1'); store.open('PRODUCT'); initial.next(projection(1));
    const base = store.snapshot.draft!;
    store.setDraft({ ...base, assignments: [{ ...base.assignments[0], optionValues: new Map([['color', 'blue']]) }] });
    store.refresh();
    expect(store.snapshot.pendingSku).toBe('PRODUCT');
    expect(manager.read).toHaveBeenCalledTimes(1);
    store.setDraft(base); store.keepCurrent(); store.refresh();
    expect(manager.read).toHaveBeenCalledTimes(2);
    store.ngOnDestroy();
  });

  it('keeps Clear intent and blocks on Unknown while reconciling a transport failure', () => {
    const initial = new Subject<ReturnType<typeof projection>>(), firstCheck = new Subject<ReturnType<typeof projection>>(), secondCheck = new Subject<ReturnType<typeof projection>>(), write = new Subject<ProductOptionsWriteResult>();
    const manager = { read: vi.fn().mockReturnValueOnce(initial).mockReturnValueOnce(firstCheck).mockReturnValueOnce(secondCheck), write: vi.fn().mockReturnValue(write) } as unknown as ManageProductOptionsUseCase;
    const store = new AdminProductOptionsStore(manager);
    store.setActor({ id: 'admin', roles: [UserRole.Admin] }, 'epoch-1'); store.open('PRODUCT'); initial.next(projection(1)); store.requestClear(); store.confirmClear();
    write.error(new HttpErrorResponse({ status: 0 })); store.refresh(); firstCheck.next(AdminProductOptionsMapper.fromWire({ revision: 1, state: 'FUTURE', axes: [], assignments: [] }));
    expect(store.snapshot.phase).toBe(OptionEditorPhase.OutcomeUnknown); expect(manager.write).toHaveBeenCalledTimes(1);
    store.refresh(); secondCheck.next(AdminProductOptionsMapper.fromWire({ revision: 2, state: 'ABSENT', cause: null, axes: [], assignments: [] }));
    expect(store.snapshot.phase).toBe(OptionEditorPhase.Success); expect(store.snapshot.base?.schema.state.wire).toBe('ABSENT'); expect(manager.write).toHaveBeenCalledTimes(1);
    expect(verifiedOptionsSnapshot(store.snapshot)?.schema.state.wire).toBe('ABSENT');
    store.ngOnDestroy();
  });

  it('clears an Unknown observation when reconciliation verifies the unchanged base revision', () => {
    const initial = new Subject<ReturnType<typeof projection>>(), unknown = new Subject<ReturnType<typeof projection>>(), recovered = new Subject<ReturnType<typeof projection>>(), write = new Subject<ProductOptionsWriteResult>();
    const manager = { read: vi.fn().mockReturnValueOnce(initial).mockReturnValueOnce(unknown).mockReturnValueOnce(recovered), write: vi.fn().mockReturnValue(write) } as unknown as ManageProductOptionsUseCase;
    const store = new AdminProductOptionsStore(manager);
    store.setActor({ id: 'admin', roles: [UserRole.Admin] }, 'epoch-1'); store.open('PRODUCT'); initial.next(projection(1)); store.save();
    write.error(new HttpErrorResponse({ status: 0 })); store.refresh();
    unknown.next(AdminProductOptionsMapper.fromWire({ revision: 1, state: 'FUTURE', axes: [], assignments: [] }));
    expect(verifiedOptionsSnapshot(store.snapshot)?.schema.state.wire).toBe('UNKNOWN');
    store.refresh(); recovered.next(projection(1));
    expect(store.snapshot.phase).toBe(OptionEditorPhase.Ready);
    expect(verifiedOptionsSnapshot(store.snapshot)?.schema.state.wire).toBe('VALID');
    expect(store.snapshot.verificationUnknown).toBe(false);
    store.ngOnDestroy();
  });

  it('invalidates late reads when the actor epoch changes and keeps operators read-only', () => {
    const late = new Subject<ReturnType<typeof projection>>(), manager = { read: vi.fn().mockReturnValue(late), write: vi.fn() } as unknown as ManageProductOptionsUseCase;
    const store = new AdminProductOptionsStore(manager);
    store.setActor({ id: 'admin', roles: [UserRole.Admin] }, 'epoch-1'); store.open('PRODUCT');
    store.setActor({ id: 'operator', roles: [UserRole.Operator] }, 'epoch-2'); late.next(projection(1));
    expect(store.snapshot.canRead).toBe(true); expect(store.snapshot.canWrite).toBe(false); expect(store.snapshot.base).toBeNull();
    store.ngOnDestroy();
  });
});
