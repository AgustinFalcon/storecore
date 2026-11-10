import { TestBed } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import { UserSession } from '../../core/auth/user-session';
import { AdjustAvailableStockUseCase } from '../../domain/user/inventory-adjustment.repository';
import { mapInventoryAdjustmentReceipt } from '../../data/user/inventory-adjustment.mapper';
import { mapInventoryRow } from '../../data/mappers/http-mappers';
import { AdjustAvailableStockCommand, InventoryAdjustmentLookup, InventoryAdjustmentPhase, InventoryAdjustmentReceipt, InventoryAdjustmentResult } from '../../domain/user/inventory-adjustment';
import { CapabilityModuleId } from '../../domain/user/capability-module-id';
import { CapabilityModuleState } from '../../domain/user/capability-module-state';
import { UserRole } from '../../domain/user/user-role';
import { ReadCapabilitiesUseCase } from '../../domain/user/use-cases/read-capabilities.usecase';
import { InventoryAdjustmentAttemptJournal } from './inventory-adjustment-attempt';
import { InventoryAdjustmentStore } from './inventory-adjustment.store';
const row = mapInventoryRow({ variantId: '42', sku: 'SKU', state: 'KNOWN', available: 8, reserved: 3, safety: 2, onHand: 11, saleable: 6 });
const receipt = (command: AdjustAvailableStockCommand): InventoryAdjustmentReceipt => mapInventoryAdjustmentReceipt({ commandId: command.commandId, variantId: command.variantId, state: 'APPLIED', reason: null, before: command.expected, after: { ...command.expected, available: command.expected.available + command.quantityDelta }, ledgerId: '9', recordedAt: '2026-11-10T00:00:00Z' });
function setup() {
  sessionStorage.clear();
  const repository = {
    submit: vi.fn((command: AdjustAvailableStockCommand): Observable<InventoryAdjustmentReceipt> => of(receipt(command))),
    lookup: vi.fn((): Observable<InventoryAdjustmentResult> => of({ lookup: InventoryAdjustmentLookup.NotFound, receipt: null })),
    refreshCsrf: vi.fn(() => of(undefined)),
  };
  TestBed.configureTestingModule({ providers: [UserSession, InventoryAdjustmentStore, InventoryAdjustmentAttemptJournal, { provide: AdjustAvailableStockUseCase, useValue: new AdjustAvailableStockUseCase(repository) }, { provide: ReadCapabilitiesUseCase, useValue: { execute: () => of([{ id: CapabilityModuleId.ManualFulfillment, state: CapabilityModuleState.Active, configVersion: 1 }]) } }] });
  const session = TestBed.inject(UserSession); session.commit({ id: 'operator', roles: [UserRole.Operator] }, 'csrf');
  const store = TestBed.inject(InventoryAdjustmentStore); TestBed.tick();
  return { store, repository, session, journal: TestBed.inject(InventoryAdjustmentAttemptJournal) };
}
function review(store: InventoryAdjustmentStore): void { store.open(row, true); store.change('-2', ' Conteo '); store.review(); }
describe('InventoryAdjustmentStore', () => {
  afterEach(() => vi.restoreAllMocks());
  it('requires fresh known balances, review and one frozen command for double activation', () => {
    const { store, repository } = setup(); store.open(row, false); expect(store.snapshot.visible).toBe(false);
    store.confirm(); expect(repository.submit).not.toHaveBeenCalled();
    review(store); const late = new Subject<InventoryAdjustmentReceipt>(); repository.submit.mockReturnValue(late);
    store.confirm(); store.confirm(); store.review();
    expect(repository.submit).toHaveBeenCalledTimes(1); expect(store.snapshot.phase).toBe(InventoryAdjustmentPhase.Submitting);
    const command = repository.submit.mock.calls[0][0]; expect(command.reason).toBe('Conteo');
    late.next(receipt(command)); expect(store.snapshot.phase).toBe(InventoryAdjustmentPhase.Applied); expect(store.snapshot.pending).toBe(false);
  });
  it('blocks all variants while uncertain and keeps exact payload after NOT_FOUND and replay', () => {
    const { store, repository } = setup(); repository.submit.mockReturnValueOnce(throwError(() => new Error('lost')));
    review(store); store.confirm(); const command = repository.submit.mock.calls[0][0];
    expect(store.snapshot.phase).toBe(InventoryAdjustmentPhase.OutcomeUnknown); store.close();
    store.open({ ...row, variantId: '43', sku: 'OTHER' }, true); expect(store.snapshot.visible).toBe(false); expect(store.snapshot.row?.variantId).toBe('42');
    store.recover(); expect(store.snapshot.pending).toBe(true); expect(repository.submit).toHaveBeenCalledTimes(1);
    store.replay(); expect(repository.refreshCsrf).toHaveBeenCalledTimes(1); expect(repository.submit.mock.calls[1][0]).toBe(command); expect(store.snapshot.phase).toBe(InventoryAdjustmentPhase.Applied);
  });
  it.each(['commandId', 'variantId'] as const)('retains the journal on mismatched %s receipts', (field) => {
    const { store, repository, journal, session } = setup(); repository.submit.mockImplementation(command => of({ ...receipt(command), [field]: 'other' }));
    review(store); store.confirm(); expect(store.snapshot.phase).toBe(InventoryAdjustmentPhase.OutcomeUnknown); expect(store.snapshot.pending).toBe(true);
    expect(journal.read('operator', session.authenticationEpoch())).not.toBeNull();
  });
  it('retains the journal when a matching receipt is malformed', () => {
    const { store, repository, journal, session } = setup();
    repository.submit.mockImplementation(command => of(mapInventoryAdjustmentReceipt({
      commandId: command.commandId, variantId: command.variantId, state: 'REJECTED', reason: 'BALANCE_CHANGED',
      before: null, after: null, ledgerId: null, recordedAt: '2026-11-10T00:00:00Z',
    })));
    review(store); store.confirm();
    expect(store.snapshot.phase).toBe(InventoryAdjustmentPhase.OutcomeUnknown); expect(store.snapshot.pending).toBe(true);
    expect(journal.read('operator', session.authenticationEpoch())).not.toBeNull();
  });
  it('does not POST when journal persistence fails', () => {
    const { store, repository, journal } = setup(); vi.spyOn(journal, 'remember').mockReturnValue(false);
    review(store); store.confirm(); expect(repository.submit).not.toHaveBeenCalled(); expect(store.snapshot.message).toContain('no enviamos');
  });
  it('keeps a confirmed applied receipt when storage cannot release the journal', () => {
    const { store, journal } = setup(); vi.spyOn(journal, 'clear').mockReturnValue(false);
    review(store); store.confirm(); expect(store.snapshot.phase).toBe(InventoryAdjustmentPhase.Applied); expect(store.snapshot.receipt).not.toBeNull(); expect(store.snapshot.pending).toBe(true);
  });
  it('invalidates a pending callback when the same user logs into a new epoch', () => {
    const { store, repository, session } = setup(); const late = new Subject<InventoryAdjustmentReceipt>(); repository.submit.mockReturnValue(late);
    review(store); store.confirm(); const command = repository.submit.mock.calls[0][0]; const oldEpoch = session.authenticationEpoch();
    session.clear(); session.commit({ id: 'operator', roles: [UserRole.Operator] }, 'new-csrf'); TestBed.tick();
    expect(session.authenticationEpoch()).not.toBe(oldEpoch); late.next(receipt(command));
    expect(store.snapshot.phase).toBe(InventoryAdjustmentPhase.Closed); expect(store.snapshot.receipt).toBeNull(); expect(store.snapshot.row).toBeNull();
  });
  it('preserves delta/reason after a durable conflict and requires another review', () => {
    const { store, repository } = setup(); repository.submit.mockImplementation(command => of(mapInventoryAdjustmentReceipt({ commandId: command.commandId, variantId: command.variantId, state: 'REJECTED', reason: 'BALANCE_CHANGED', before: { available: 7, reserved: 4, safety: 2 }, after: null, ledgerId: null, recordedAt: '2026-11-10T00:00:00Z' })));
    review(store); store.confirm(); expect(store.snapshot.phase).toBe(InventoryAdjustmentPhase.Conflict); store.confirm(); expect(repository.submit).toHaveBeenCalledTimes(1);
    store.reviewConflict({ ...row, availableQuantity: 7, reservedQuantity: 4 }, true);
    expect(store.snapshot.delta).toBe('-2'); expect(store.snapshot.reason).toBe('Conteo'); expect(store.snapshot.phase).toBe(InventoryAdjustmentPhase.Editing);
  });
});
