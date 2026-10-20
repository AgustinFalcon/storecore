import { DemoProductEditorComponent } from './demo-product-editor';
import { DemoProductDraftEditor } from './catalog/product-draft-editor';
import { ProductCondition, VariantSaleState } from './catalog/catalog-types';

describe('product editor proposal controls', () => {
  function fixture() { const component = new DemoProductEditorComponent(); component.product = new DemoProductDraftEditor(undefined, component.mediaOptions).create('NEW'); return component; }
  it('retains the bound proposal identity while reordering local media', () => {
    const component = fixture(), bound = component.product;
    component.addMedia(); const last = component.product.media[1].id;
    component.moveMedia(1, -1);
    expect(component.product).toBe(bound);
    expect(component.product.media[0].id).toBe(last);
    expect(component.product.media[0].src).toMatch(/\.svg$/);
    component.removeMedia(1); component.removeMedia(0);
    expect(component.product.media).toHaveLength(1);
    expect(component.issue).not.toBe('');
  });
  it('preserves reserved variants and translates unknown option values safely', () => {
    const component = fixture(); component.addVariant();
    const reserved = component.product.variants[1]; reserved.reserved = 1;
    component.removeVariant(1);
    expect(component.product.variants).toContain(reserved);
    expect(component.issue).not.toBe('');
    component.setSale(reserved, 'future');
    expect(reserved.saleState).toBe(VariantSaleState.Unknown);
    component.setCondition(reserved, ProductCondition.Outlet.wire);
    expect(reserved.outlet?.media[0].src).toBe(component.product.media[0].src);
    expect(reserved.outlet?.media).not.toBe(component.product.media);
  });
});
