import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, Subject, throwError } from 'rxjs';
import { ApiErrorCode } from '../../core/api/api-error-code';
import { CapabilityModuleId as Module } from '../../domain/user/capability-module-id';
import { CapabilityModuleState as State } from '../../domain/user/capability-module-state';
import { CapabilityMutationPhase as Phase } from '../../domain/user/capability-mutation-phase';
import { CapabilityStateIntent } from '../../domain/user/capability-state-intent';
import { UserRole } from '../../domain/user/user-role';
import { CapabilityModule } from '../../domain/user/user.entity';
import { ReadCapabilitiesUseCase } from '../../domain/user/use-cases/read-capabilities.usecase';
import { ChangeCapabilityStateUseCase } from '../../domain/user/use-cases/change-capability-state.usecase';
import { UserCapabilitiesStore } from './user-capabilities.store';
import { CapabilityReadState } from './capability-read-state';
import { CapabilityCommandJournal } from './capability-command.journal';

const row: CapabilityModule = { id: Module.Catalog, state: State.Disabled, configVersion: 2 };
const other = { ...row, id: Module.Favorites };
const receipt = { ...row, state: State.Active, configVersion: 3 };
const actor = { id: 'admin', roles: [UserRole.Admin] };
function setup(command: (intent: CapabilityStateIntent) => Observable<CapabilityModule> = () => of(receipt), journal = new CapabilityCommandJournal()) {
  const read = vi.fn<() => Observable<readonly CapabilityModule[]>>(() => of([row, other]));
  const write = vi.fn(command);
  const store = new UserCapabilitiesStore({ execute: read } as unknown as ReadCapabilitiesUseCase,
    { execute: write } as unknown as ChangeCapabilityStateUseCase, journal);
  store.setActor(actor, 'epoch-1'); store.loadCapabilities();
  return { store, read, write };
}
function edit(store: UserCapabilitiesStore) {
  store.beginEdit(store.snapshot.modules[0]); store.updateDraft({ target: State.Active, reason: '  Cambio autorizado  ' });
}
describe('Capability command actor-safe store', () => {
  beforeEach(() => sessionStorage.clear());
  it('preserves uncertainty across store recreation and browser journal reload in the same epoch', () => {
    const journal = new CapabilityCommandJournal();
    const first = setup(() => throwError(() => new HttpErrorResponse({ status: 0 })), journal);
    edit(first.store); first.store.confirm(); const intent = first.store.snapshot.intent!; first.store.ngOnDestroy();
    const second = setup(() => of(receipt), journal);
    expect(second.store.snapshot.phase).toBe(Phase.ResultUncertain);
    expect(second.store.snapshot.intent?.toWire()).toEqual(intent.toWire());
    edit(second.store); second.store.confirm(); expect(second.write).not.toHaveBeenCalled(); second.store.ngOnDestroy();
    const reloaded = setup(() => of(receipt), new CapabilityCommandJournal());
    expect(reloaded.store.snapshot.mutationLocked).toBe(true);
    expect(reloaded.store.snapshot.draft?.reason).toBe(intent.reason);
    reloaded.store.setActor(actor, 'epoch-2'); reloaded.store.loadCapabilities(); edit(reloaded.store); reloaded.store.confirm();
    expect(reloaded.write).toHaveBeenCalledTimes(1); reloaded.store.ngOnDestroy();
  });
  it('records before dispatch and preserves a pending fence after destroy', () => {
    const journal = new CapabilityCommandJournal(); const response = new Subject<CapabilityModule>();
    const first = setup(intent => {
      expect(journal.recover('epoch-1').intent?.correlationId).toBe(intent.correlationId);
      return response;
    }, journal);
    edit(first.store); first.store.confirm(); const intent = first.store.snapshot.intent!;
    expect(first.store.snapshot.phase).toBe(Phase.Saving); first.store.ngOnDestroy();
    const second = setup(() => of(receipt), journal);
    expect(second.store.snapshot.phase).toBe(Phase.ResultUncertain);
    expect(second.store.snapshot.intent?.correlationId).toBe(intent.correlationId);
    second.store.confirm(); expect(second.write).not.toHaveBeenCalled();
    response.next(receipt); expect(journal.recover('epoch-1').locked).toBe(true); second.store.ngOnDestroy();
  });
  it.each([400, 409, 422])('releases a persisted fence after definitive rejection %s', status => {
    const journal = new CapabilityCommandJournal(); const first = setup(() => throwError(() => new HttpErrorResponse({ status })), journal);
    edit(first.store); first.store.confirm(); expect(journal.recover('epoch-1').locked).toBe(false); first.store.ngOnDestroy();
  });
  it('posts once under overlap and applies the authoritative row while preserving all others', () => {
    const response = new Subject<CapabilityModule>(); const { store, write, read } = setup(() => response);
    edit(store); store.confirm(); const intent = store.snapshot.intent;
    store.confirm(); store.loadCapabilities(); store.beginEdit(other);
    expect(write).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledTimes(1);
    expect(store.snapshot.phase).toBe(Phase.Saving); expect(intent?.reason).toBe('Cambio autorizado');
    response.next(receipt);
    expect(store.snapshot.modules).toEqual([receipt, other]); expect(store.snapshot.phase).toBe(Phase.Confirmed);
    expect(store.snapshot.draft).toBeNull(); store.ngOnDestroy();
  });
  it('denies OPERATOR, unknown actors, non-authoritative and unknown rows', () => {
    const { store, write } = setup();
    store.beginEdit({ ...row }); expect(store.snapshot.draft).toBeNull();
    store.setActor({ id: 'op', roles: [UserRole.Operator] }, 'epoch-2'); store.loadCapabilities(); edit(store); store.confirm();
    expect(store.snapshot.canMutate).toBe(false); expect(write).not.toHaveBeenCalled();
    store.setActor({ id: 'unknown', roles: [UserRole.Unknown] }, 'epoch-3'); store.loadCapabilities();
    expect(store.snapshot.modules).toEqual([]); store.ngOnDestroy();
  });
  it('classifies only the closed CAS error, refreshes and requires a new explicit confirmation', () => {
    const { store, read, write } = setup(() => throwError(() => new HttpErrorResponse({ status: 409, error: { errorCode: ApiErrorCode.CapabilityConfigVersionConflict.wire } })));
    const refreshed = new Subject<readonly CapabilityModule[]>(); read.mockReturnValueOnce(refreshed);
    edit(store); store.confirm(); const first = store.snapshot.intent;
    expect(store.snapshot.phase).toBe(Phase.Conflict); expect(store.snapshot.draft?.reason).toContain('Cambio autorizado');
    store.confirm(); expect(write).toHaveBeenCalledTimes(1);
    refreshed.next([{ ...row, configVersion: 3 }, other]);
    expect(store.snapshot.draft?.row.configVersion).toBe(3); expect(write).toHaveBeenCalledTimes(1);
    store.confirm(); expect(write).toHaveBeenCalledTimes(2); expect(store.snapshot.intent?.correlationId).not.toBe(first?.correlationId);
    store.ngOnDestroy();
  });
  it.each([400, 404, 409, 422])('rejects ordinary %s without conflict refresh or an epoch lock', status => {
    const { store, write, read } = setup(() => throwError(() => new HttpErrorResponse({ status, error: { errorCode: 'OTHER' } })));
    edit(store); store.confirm(); expect(store.snapshot.phase).toBe(Phase.Rejected);
    expect(store.snapshot.mutationLocked).toBe(false); expect(write).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledTimes(1); store.ngOnDestroy();
  });
  it.each([0, 500, 503])('locks the epoch for uncertain %s and preserves the UUID after a failed observation', status => {
    const { store, write, read } = setup(() => throwError(() => new HttpErrorResponse({ status })));
    read.mockReturnValueOnce(throwError(() => new Error('observation unavailable')));
    edit(store); store.confirm(); const intent = store.snapshot.intent;
    expect(store.snapshot.phase).toBe(Phase.ResultUncertain); expect(store.snapshot.draft?.target).toBe(State.Active);
    store.closeEditor(); store.loadCapabilities(); edit(store); store.confirm();
    expect(store.snapshot.intent).toBe(intent); expect(write).toHaveBeenCalledTimes(1);
    store.setActor({ ...actor, roles: [UserRole.Admin, UserRole.Operator] }, 'epoch-1');
    expect(store.snapshot.mutationLocked).toBe(true);
    store.setActor(actor, 'epoch-2'); store.loadCapabilities(); edit(store);
    expect(store.snapshot.mutationLocked).toBe(false); store.ngOnDestroy();
  });
  it('keeps a 5xx uncertain even if a malformed server error carries the CAS code', () => {
    const { store } = setup(() => throwError(() => new HttpErrorResponse({ status: 500, error: { errorCode: ApiErrorCode.CapabilityConfigVersionConflict.wire } })));
    edit(store); store.confirm(); expect(store.snapshot.phase).toBe(Phase.ResultUncertain); store.ngOnDestroy();
  });
  it.each([new Error('timeout'), new Error('invalid JSON')])('treats post-dispatch failure as uncertain', error => {
    const { store } = setup(() => throwError(() => error)); edit(store); store.confirm();
    expect(store.snapshot.phase).toBe(Phase.ResultUncertain); expect(store.snapshot.mutationLocked).toBe(true); store.ngOnDestroy();
  });
  it.each([{ ...receipt, id: Module.Favorites }, { ...receipt, state: State.Unknown }, { ...receipt, configVersion: null }])('rejects unusable success as uncertain', response => {
    const { store } = setup(() => of(response)); edit(store); store.confirm();
    expect(store.snapshot.phase).toBe(Phase.ResultUncertain); store.ngOnDestroy();
  });
  it('treats a skipped resulting version as uncertain instead of attributing another write', () => {
    const { store } = setup(() => of({ ...receipt, configVersion: 4 })); edit(store); store.confirm();
    expect(store.snapshot.phase).toBe(Phase.ResultUncertain); expect(store.snapshot.mutationLocked).toBe(true); store.ngOnDestroy();
  });
  it.each([401, 403])('clears private data on command authorization loss %s', status => {
    const { store } = setup(() => throwError(() => new HttpErrorResponse({ status })));
    edit(store); store.confirm(); expect(store.snapshot.modules).toEqual([]); expect(store.snapshot.draft).toBeNull();
    expect(store.snapshot.intent).toBeNull(); expect(store.snapshot.readState).toBe(CapabilityReadState.AccessDenied); store.ngOnDestroy();
  });
  it('fences a late command across same-principal reauthentication and actor changes', () => {
    const response = new Subject<CapabilityModule>(); const { store } = setup(() => response);
    edit(store); store.confirm(); store.setActor(actor, 'epoch-2'); store.loadCapabilities();
    response.next(receipt); expect(store.snapshot.modules[0]).toBe(row); expect(store.snapshot.phase).toBe(Phase.Idle);
    expect(store.snapshot.draft).toBeNull(); expect(store.snapshot.intent).toBeNull(); store.ngOnDestroy();
  });
  it('older GETs never overwrite command results or strand the write fence', () => {
    const response = new Subject<CapabilityModule>(); const { store, read, write } = setup(() => response);
    const old = new Subject<readonly CapabilityModule[]>(); read.mockReturnValueOnce(old);
    edit(store); store.loadCapabilities(); old.next([row, other]); store.confirm();
    old.next([]); expect(store.snapshot.modules).toHaveLength(2);
    response.next(receipt); old.next([]); expect(store.snapshot.modules).toEqual([receipt, other]);
    store.beginEdit(store.snapshot.modules[0]); store.updateDraft({ target: State.Disabled, reason: 'otro' }); store.confirm();
    expect(write).toHaveBeenCalledTimes(2); store.ngOnDestroy();
  });
  it('handles synchronous preparation failure before dispatch as rejected and releases the fence', () => {
    const { store, write } = setup(() => { throw new Error('pre-dispatch'); }); edit(store); store.confirm();
    expect(store.snapshot.phase).toBe(Phase.Rejected); expect(store.snapshot.mutationLocked).toBe(false);
    store.confirm(); expect(write).toHaveBeenCalledTimes(2); store.ngOnDestroy();
  });
});
