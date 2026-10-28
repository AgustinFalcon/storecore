import { ContentDraft, ContentDraftIssue as Issue } from './content-draft';
import { ContentAuthority, ContentDialog, ContentDraftStatus, ContentEditPhase, ContentDiscardIntent } from './content-types';
import { DemoContext } from '../demo-model';
import { UserRole } from '../../domain/user/user-role';
import { demoMoney } from '../demo-money';

describe('SC16 closed domain and isolated drafts', () => {
  const draft = () => ({ title: 'Home', subtitle: 'Description', blocks: [{ id: 'a', title: 'A', body: 'Alpha' }, { id: 'b', title: 'B', body: 'Beta' }] });
  it('closes every finite vocabulary and blocks Unknown editing', () => {
    for (const type of [ContentEditPhase, ContentDialog, ContentDraftStatus, ContentDiscardIntent, Issue]) {
      for (const value of type.all) expect(type.fromWire(value.wire)).toBe(value);
      expect(type.fromWire('invented')).toBe(type.Unknown);
    }
    expect(ContentEditPhase.Unknown.canEdit).toBe(false);
    expect(ContentDraftStatus.of(true)).toBe(ContentDraftStatus.Dirty);
  });
  it('grants content authority only to Admin context and Admin/Operator roles', () => {
    for (const context of [DemoContext.Customer, DemoContext.Admin, DemoContext.Unknown]) for (const role of [UserRole.Admin, UserRole.Operator, UserRole.Unknown]) {
      expect(ContentAuthority.permits(context, role)).toBe(context === DemoContext.Admin && (role === UserRole.Admin || role === UserRole.Operator));
    }
  });
  it('preserves minor-unit decimals in the shared Home/preview formatter', () => { expect(demoMoney(10099)).toContain('100,99'); expect(demoMoney(10000)).not.toContain(',00'); });
  it('deep copies and reorders without sharing or changing the source', () => {
    const original = draft(), copy = ContentDraft.clone(original), reordered = ContentDraft.reorder(copy, 0, 1);
    reordered.blocks[0].title = 'Changed';
    expect(original.blocks[0].id).toBe('a'); expect(original.blocks[1].title).toBe('B');
    expect(ContentDraft.same(original, copy)).toBe(true);
    expect(ContentDraft.reorder(original, 0, -1)).toEqual(original);
  });
  it('validates fields and rejects malformed structures and duplicate IDs at one wire boundary', () => {
    expect(ContentDraft.issue({ ...draft(), title: ' ' })).toBe(Issue.Title);
    for (const raw of [null, {}, [], { ...draft(), extra: true }, { ...draft(), blocks: [{ id: 'x', title: '', body: 'body' }] }, { ...draft(), blocks: [{ id: 'x', title: 'X', body: '' }] }, { ...draft(), blocks: [{ id: 'x', title: 'X', body: 'x' }, { id: 'x', title: 'Y', body: 'y' }] }]) expect(() => ContentDraft.fromWire(raw)).toThrow(Issue.Unknown.label);
    expect(ContentDraft.fromWire(draft())).toEqual(draft());
  });
});
