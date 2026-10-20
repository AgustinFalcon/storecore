import { ProductCondition } from './catalog-types';
import { DemoProductDraftEditor, ProductDraftIssue } from './product-draft-editor';

describe('DemoProductDraftEditor', () => {
  const ids = ['media-id', 'variant-id-123456', 'outlet-id'];
  let editor: DemoProductDraftEditor;

  beforeEach(() => {
    let index = 0;
    editor = new DemoProductDraftEditor(() => ids[index++] ?? `id-${index}`, ['/one.jpg', '/two.jpg']);
  });

  it('creates and extends a typed product draft without mutating the source collections', () => {
    const initial = editor.create('DEMO-NEW');
    const withAttribute = editor.addAttribute(initial);
    const withMedia = editor.addMedia(withAttribute);
    const withVariant = editor.addVariant(withMedia);

    expect(initial.attributes).toHaveLength(1);
    expect(initial.media).toHaveLength(1);
    expect(initial.variants).toHaveLength(1);
    expect(withVariant.attributes).toHaveLength(2);
    expect(withVariant.media.at(-1)?.src).toBe('/two.jpg');
    expect(withVariant.variants.at(-1)?.id).toContain('DEMO-NEW-variant-variant-');
  });

  it('returns closed issues when required media or variants cannot be removed', () => {
    const draft = editor.create();
    expect(editor.removeMedia(draft, 0).issue).toBe(ProductDraftIssue.NeedsMedia);
    expect(editor.removeVariant(draft, 0).issue).toBe(ProductDraftIssue.NeedsVariant);
    expect(ProductDraftIssue.fromWire('NEEDS_MEDIA')).toBe(ProductDraftIssue.NeedsMedia);
    expect(ProductDraftIssue.fromWire('invalid')).toBe(ProductDraftIssue.Unknown);
  });

  it('preserves a reserved variant and supports deterministic media reordering', () => {
    const draft = editor.addVariant(editor.addMedia(editor.create('DEMO-X')));
    draft.variants[1].reserved = 1;
    expect(editor.removeVariant(draft, 1).issue).toBe(ProductDraftIssue.ReservedVariant);
    const moved = editor.moveMedia(draft, 1, -1);
    expect(moved.media[0].id).toBe('media-id');
    expect(draft.media[0].id).toBe('new-front');
  });

  it('creates and clears outlet details through the closed condition translator', () => {
    const draft = editor.create('DEMO-OUTLET');
    const variant = draft.variants[0];
    editor.setCondition(draft, variant, ProductCondition.Outlet.wire);
    expect(variant.condition).toBe(ProductCondition.Outlet);
    expect(variant.outlet?.reference).toBe(variant.id);
    expect(variant.outlet?.media).toEqual(draft.media);
    expect(variant.outlet?.media).not.toBe(draft.media);

    editor.setCondition(draft, variant, ProductCondition.Standard.wire);
    expect(variant.condition).toBe(ProductCondition.Standard);
    expect(variant.outlet).toBeNull();
  });
});
