import { ContentDraft, ContentDraftIssue } from './content-draft';
import { ContentFlow, ContentFlowPort } from './content-flow';
import { ContentEditPhase as Phase } from './content-types';

describe('SC16 flow steps and generation fence', () => {
  function setup() {
    let epoch = 0, authorized = true, writes = 0;
    let complete!: (saved: boolean) => void;
    const saved = { title: 'Original draft', subtitle: '', blocks: [{ id: 'x', title: 'X', body: 'Text' }] };
    const port: ContentFlowPort = { epoch: () => epoch, authorized: () => authorized, read: () => saved, error: () => 'Write failed', save: () => { writes++; return new Promise(resolve => complete = resolve); } };
    const flow = new ContentFlow(port);
    return { flow, saved, writes: () => writes, complete: (ok: boolean) => complete(ok), nextEpoch: () => epoch++, deny: () => authorized = false };
  }
  it('previews copies, validates input and restores the saved baseline on discard', async () => {
    const { flow, saved, writes } = setup(); flow.draft.title = 'Edited'; flow.edit();
    const preview = flow.preview(); preview.blocks[0].title = 'Preview only';
    expect(saved.title).toBe('Original draft'); expect(flow.draft.blocks[0].title).toBe('X');
    flow.discard(); expect(flow.dirty).toBe(false);
    flow.draft.title = ' '; flow.edit(); await flow.save();
    expect(flow.phase).toBe(Phase.Invalid); expect(flow.issue).toBe(ContentDraftIssue.Title); expect(writes()).toBe(0);
  });
  it('serializes save and retains the exact buffer after failure before successful retry', async () => {
    const state = setup(), { flow } = state; flow.draft.title = 'Changed'; flow.edit();
    const pending = flow.save(); await flow.save(); expect(state.writes()).toBe(1); expect(flow.phase).toBe(Phase.Saving);
    state.complete(false); await pending; expect(flow.phase).toBe(Phase.Failure); expect(flow.draft.title).toBe('Changed'); expect(flow.dirty).toBe(true);
    const retry = flow.save(); state.complete(true); await retry;
    expect(flow.phase).toBe(Phase.Saved); expect(flow.dirty).toBe(false);
    flow.draft.title = 'Later'; flow.edit(); flow.discard(); expect(flow.draft.title).toBe('Changed');
  });
  it('ignores results from the old epoch, actor or disposed editor', async () => {
    for (const dispose of [false, true]) {
      const state = setup(), { flow } = state; flow.draft.title = 'Private'; flow.edit(); const pending = flow.save();
      if (dispose) flow.dispose(); else { state.nextEpoch(); state.deny(); flow.refresh(); }
      state.complete(true); await pending;
      expect(flow.phase).toBe(Phase.Denied); expect(ContentDraft.same(flow.draft, ContentDraft.empty())).toBe(true);
    }
  });
});
