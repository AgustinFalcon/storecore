import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { UserSession } from '../../core/auth/user-session';
import { UserRole } from '../../domain/user/user-role';
import { ProfileImportPhase, PreviewValidity } from '../../domain/user/profile-import';
import { ImportProfileUseCase } from '../../domain/user/use-cases/import-profile.usecase';
import { ProfilePreview } from '../../domain/user/user.entity';
import { ProfileImportStore } from './profile-import.store';

const manifest = JSON.stringify({ profile_name: 'profile', profile_version: '1.0.0', coreCompatibility: '1.x', content: { homeSections: [{ sectionKey: 'hero', content: { title: 'Hola' } }] } });
const change = { sectionKey: 'hero', operation: 'ADD', after: { content: { title: 'Hola' }, active: true, sortOrder: 0 } };
const previewResult = { compatible: true, version: '1.0.0', diff: JSON.stringify([change]) };
const mergeResult = { ...previewResult, diff: JSON.stringify({ changes: [change] }) };

describe('ProfileImportStore', () => {
  let session: UserSession;
  let store: ProfileImportStore;
  let preview: ReturnType<typeof vi.fn>;
  let merge: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    session = new UserSession(); session.commit({ id: 'admin-a', roles: [UserRole.Admin] }, 'csrf');
    preview = vi.fn(() => of(previewResult)); merge = vi.fn(() => of(mergeResult));
    TestBed.configureTestingModule({ providers: [ProfileImportStore, { provide: UserSession, useValue: session }, { provide: ImportProfileUseCase, useValue: { preview, merge } }] });
    store = TestBed.inject(ProfileImportStore); TestBed.tick();
  });
  function review(): void { store.setManifest(manifest); store.previewProfile(); store.selectSection('hero', true); store.previewProfile(); }
  it('requires explicit selection, repreview of its exact text and confirmation', () => {
    store.setManifest(manifest); store.previewProfile(); expect(store.canConfirm).toBe(false);
    store.selectSection('hero', true); const final = store.snapshot.manifest;
    expect(JSON.parse(final).mergeSelection.homeSections).toEqual(['hero']);
    expect(store.snapshot.validity).toBe(PreviewValidity.Stale);
    store.requestConfirmation(); store.mergeProfile(); expect(merge).not.toHaveBeenCalled();
    store.previewProfile(); expect(preview).toHaveBeenLastCalledWith(final); expect(store.canConfirm).toBe(true);
    store.requestConfirmation(); store.mergeProfile(); expect(merge).toHaveBeenCalledExactlyOnceWith(final);
    expect(store.snapshot.phase).toBe(ProfileImportPhase.Succeeded);
    store.mergeProfile(); expect(merge).toHaveBeenCalledTimes(1);
  });
  it('cancels confirmation without mutation and invalidates edits', () => {
    review(); store.requestConfirmation(); store.cancelConfirmation(); expect(store.canConfirm).toBe(true); expect(merge).not.toHaveBeenCalled();
    store.setManifest(manifest); expect(store.snapshot.review).toBeNull(); expect(store.snapshot.selection).toEqual([]); expect(store.canConfirm).toBe(false);
  });
  it('blocks duplicate preview and merge dispatch while requests are pending', () => {
    const pending = new Subject<ProfilePreview>(); preview.mockReturnValue(pending);
    store.setManifest(manifest); store.previewProfile(); store.previewProfile(); expect(preview).toHaveBeenCalledTimes(1);
    pending.next(previewResult); pending.complete(); store.selectSection('hero', true); preview.mockReturnValue(of(previewResult)); store.previewProfile();
    const write = new Subject<ProfilePreview>(); merge.mockReturnValue(write);
    store.requestConfirmation(); store.mergeProfile(); store.mergeProfile(); store.requestConfirmation(); expect(merge).toHaveBeenCalledTimes(1);
    store.setManifest('new'); expect(store.snapshot.manifest).not.toBe('new'); write.next(mergeResult); write.complete();
    expect(store.snapshot.phase).toBe(ProfileImportPhase.Succeeded);
  });
  it.each([401, 403])('clears private content on denial %s', (status) => {
    review(); merge.mockReturnValue(throwError(() => ({ status }))); store.requestConfirmation(); store.mergeProfile();
    expect(store.snapshot.phase).toBe(ProfileImportPhase.AccessDenied); expect(store.snapshot.manifest).toBe(''); expect(store.snapshot.review).toBeNull(); store.previewProfile(); expect(preview).toHaveBeenCalledTimes(2);
  });
  it.each([0, 200, 500, 503, undefined])('holds uncertain writes for %s until explicit fresh review', (status) => {
    review(); merge.mockReturnValue(throwError(() => ({ status }))); store.requestConfirmation(); store.mergeProfile();
    expect(store.snapshot.phase).toBe(ProfileImportPhase.ResultUncertain); expect(store.snapshot.manifest).toContain('hero');
    store.mergeProfile(); store.previewProfile(); expect(merge).toHaveBeenCalledTimes(1); expect(preview).toHaveBeenCalledTimes(2);
    store.reviewUncertainResult(); expect(preview).toHaveBeenCalledTimes(3); expect(store.canConfirm).toBe(true); expect(merge).toHaveBeenCalledTimes(1);
  });
  it('preserves draft after rejected merge, but requires new preview', () => {
    review(); merge.mockReturnValue(throwError(() => ({ status: 400 }))); store.requestConfirmation(); store.mergeProfile();
    expect(store.snapshot.phase).toBe(ProfileImportPhase.Failed); expect(store.snapshot.previewManifest).toBeNull(); expect(store.snapshot.selection).toEqual(['hero']);
    store.mergeProfile(); expect(merge).toHaveBeenCalledTimes(1); store.previewProfile(); expect(store.canConfirm).toBe(true);
  });
  it('times out write as uncertain without automatic retry', () => {
    vi.useFakeTimers(); review(); merge.mockReturnValue(new Subject<ProfilePreview>()); store.requestConfirmation(); store.mergeProfile(); vi.advanceTimersByTime(30_001);
    expect(store.snapshot.phase).toBe(ProfileImportPhase.ResultUncertain); expect(merge).toHaveBeenCalledTimes(1); vi.useRealTimers();
  });
  it('invalidates and clears on actor change and discards late responses', () => {
    const response = new Subject<ProfilePreview>(); preview.mockReturnValue(response); store.setManifest(manifest); store.previewProfile();
    session.commit({ id: 'admin-b', roles: [UserRole.Admin] }, 'next'); TestBed.tick(); response.next(previewResult);
    expect(store.snapshot.manifest).toBe(''); expect(store.snapshot.review).toBeNull(); expect(store.canConfirm).toBe(false);
    store.setManifest(manifest); session.clear(); TestBed.tick(); expect(store.snapshot.phase).toBe(ProfileImportPhase.AccessDenied); expect(store.snapshot.manifest).toBe('');
  });
  it('rejects operator or unknown role without requests', () => {
    session.commit({ id: 'operator', roles: [UserRole.Operator] }, 'next'); TestBed.tick(); store.setManifest(manifest); store.previewProfile(); store.mergeProfile();
    expect(store.snapshot.phase).toBe(ProfileImportPhase.AccessDenied); expect(preview).not.toHaveBeenCalled(); expect(merge).not.toHaveBeenCalled();
  });
  it.each([{ ...previewResult, compatible: false }, { ...previewResult, diff: '{}' }, { ...previewResult, diff: JSON.stringify([{ ...change, operation: 'FUTURE' }]) }, { ...previewResult, diff: '[]' }])('closes incompatible or malformed previews %j', (result) => {
    preview.mockReturnValue(of(result)); store.setManifest(manifest); store.previewProfile(); store.selectSection('hero', true); store.requestConfirmation(); store.mergeProfile(); expect(merge).not.toHaveBeenCalled(); expect(store.canConfirm).toBe(false);
  });
  it.each(['{}', JSON.stringify({ changes: [{ ...change, after: {} }] }), JSON.stringify({ changes: [{ ...change, operation: 'UPDATE' }] })])('treats malformed successful merge response as uncertain %s', (diff) => {
    review(); merge.mockReturnValue(of({ ...mergeResult, diff })); store.requestConfirmation(); store.mergeProfile(); expect(store.snapshot.phase).toBe(ProfileImportPhase.ResultUncertain);
  });
  it('discards pending preview after destroy and preserves source on read timeout', () => {
    vi.useFakeTimers(); preview.mockReturnValue(new Subject<ProfilePreview>()); store.setManifest(manifest); store.previewProfile(); vi.advanceTimersByTime(30_001);
    expect(store.snapshot.phase).toBe(ProfileImportPhase.Failed); expect(store.snapshot.manifest).toBe(manifest); expect(store.canConfirm).toBe(false); vi.useRealTimers();
  });
  it('clears confirmation and private draft when a different admin becomes current', () => {
    review(); store.requestConfirmation(); session.commit({ id: 'admin-b', roles: [UserRole.Admin] }, 'next'); TestBed.tick(); store.mergeProfile();
    expect(merge).not.toHaveBeenCalled(); expect(store.snapshot.manifest).toBe(''); expect(store.snapshot.selection).toEqual([]);
  });
  it('rejects invalid input before HTTP and cancels timer on destroy', () => {
    store.setManifest('{'); store.previewProfile(); expect(preview).not.toHaveBeenCalled(); expect(store.snapshot.phase).toBe(ProfileImportPhase.Failed);
    const response = new Subject<ProfilePreview>(); preview.mockReturnValue(response); store.setManifest(manifest); store.previewProfile(); store.ngOnDestroy(); expect(response.observed).toBe(false);
  });
});
