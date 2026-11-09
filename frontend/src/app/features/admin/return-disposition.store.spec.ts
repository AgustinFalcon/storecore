import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { UserSession } from '../../core/auth/user-session';
import { UserRole } from '../../domain/user/user-role';
import { DamageReason, DispositionPhase, ReturnDisposition, ReturnDispositionState } from '../../domain/order/return-disposition';
import { ManageReturnDispositionUseCase } from '../../domain/order/return-disposition.repository';
import { ReturnDispositionAttempt } from './return-disposition-attempt';
import { ReturnDispositionStore } from './return-disposition.store';

const received = (orderId = '1'): ReturnDisposition => ({ orderId, returnId: '2', state: ReturnDispositionState.Editable, confirmedAt: null, lines: [{ returnItemId: '3', orderItemId: '4', sku: 'A', name: 'Artículo', quantity: 2, classification: null }] });
const confirmed = (): ReturnDisposition => ({ ...received(), state: ReturnDispositionState.Confirmed, confirmedAt: '2026-11-09T00:00:00Z', lines: received().lines.map(line => ({ ...line, classification: { returnItemId: line.returnItemId, restockQuantity: 1, damagedQuantity: 1, rejectedQuantity: 0, damageReason: DamageReason.Cosmetic, rejectionReason: null, observation: '' } })) });
function setup() {
  sessionStorage.clear();
  const manager = { read: vi.fn(() => of(received())), confirm: vi.fn(() => of(confirmed())) };
  TestBed.configureTestingModule({ providers: [ReturnDispositionStore, ReturnDispositionAttempt, UserSession, { provide: ManageReturnDispositionUseCase, useValue: manager }] });
  const session = TestBed.inject(UserSession);
  session.commit({ id: '42', roles: [UserRole.Operator] }, 'csrf');
  const store = TestBed.inject(ReturnDispositionStore);
  return { store, manager, session, attempt: TestBed.inject(ReturnDispositionAttempt) };
}
function review(store: ReturnDispositionStore) { store.load('1'); store.change('3', { restockQuantity: 1, damagedQuantity: 1, damageReason: DamageReason.Cosmetic }); store.review(); }
describe('Return disposition isolated mutation flow', () => {
  it('requires review and confirms only once with an exact classified payload', () => {
    const { store, manager } = setup(); const parentRefresh = vi.fn(); store.confirmed$.subscribe(parentRefresh); store.load('1'); store.confirm(); expect(manager.confirm).not.toHaveBeenCalled();
    review(store); expect(store.snapshot.phase).toBe(DispositionPhase.Reviewing);
    store.confirm(); store.confirm();
    expect(manager.confirm).toHaveBeenCalledTimes(1);
    expect(store.snapshot.phase).toBe(DispositionPhase.Confirmed);
    expect(store.snapshot.draft).toEqual([]);
    expect(parentRefresh).toHaveBeenCalledTimes(1);
  });
  it('keeps a failed response uncertain and recovers through GET without another POST', () => {
    const { store, manager } = setup();
    manager.confirm.mockReturnValue(throwError(() => ({ status: 0 })));
    review(store); store.confirm();
    expect(store.snapshot.phase).toBe(DispositionPhase.Uncertain);
    store.confirm(); expect(manager.confirm).toHaveBeenCalledTimes(1);
    manager.read.mockReturnValue(of(confirmed())); store.recover();
    expect(store.snapshot.phase).toBe(DispositionPhase.Confirmed);
    expect(manager.confirm).toHaveBeenCalledTimes(1);
  });
  it('rehydrates a pending key through the authoritative GET on reload', () => {
    const { store, manager, attempt } = setup();
    const parentRefresh = vi.fn(); store.confirmed$.subscribe(parentRefresh);
    attempt.remember('42', '2', '12345678-1234-1234-1234-123456789012');
    manager.read.mockReturnValue(of(confirmed())); store.load('1');
    expect(store.snapshot.phase).toBe(DispositionPhase.Confirmed);
    expect(attempt.read('42', '2')).toBeNull(); expect(manager.confirm).not.toHaveBeenCalled();
    expect(parentRefresh).not.toHaveBeenCalled();
  });
  it('clears drafts and suppresses late replies after actor or order changes', () => {
    const { store, manager, session } = setup(); const late = new Subject<ReturnDisposition>();
    review(store); manager.confirm.mockReturnValue(late); store.confirm();
    session.clear(); TestBed.tick(); late.next(confirmed());
    expect(store.snapshot.phase).toBe(DispositionPhase.AccessDenied); expect(store.snapshot.model).toBeNull();
    expect(store.snapshot.draft).toEqual([]);
  });
  it('rejects invalid partitions and isolates different order reads', () => {
    const { store, manager } = setup(); store.load('1'); store.review();
    expect(store.snapshot.phase).toBe(DispositionPhase.Editing); expect(store.snapshot.message).toContain('exactamente');
    manager.read.mockReturnValue(of(received())); store.load('8');
    expect(store.snapshot.phase).toBe(DispositionPhase.ReadOnly); expect(store.snapshot.model).toBeNull();
  });
  it('discards local attempts and drafts when a route no longer displays a return', () => {
    const { store, attempt } = setup(); review(store);
    attempt.remember('42', '2', '12345678-1234-1234-1234-123456789012');
    store.reset();
    expect(store.snapshot.model).toBeNull(); expect(store.snapshot.draft).toEqual([]);
    expect(attempt.read('42', '2')).toBeNull();
  });
});
