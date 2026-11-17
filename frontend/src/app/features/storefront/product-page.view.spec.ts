import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import { ProductPageViewComponent } from './product-page.view';
import { mapProductDetail } from '../../data/mappers/http-mappers';
import { OptionWireMapper } from '../../domain/catalog/option-wire.mapper';
import { SkuPriceResolution } from '../../domain/catalog/variant-price';

const absentOptionSchema = { revision: 1, state: 'ABSENT', cause: null, axes: [] };
const productFixture = (sku: string, images: string[] = []) => mapProductDetail({ id: 'p', sku, name: sku, status: 'ACTIVE', images, optionSchema: absentOptionSchema,
  productBasePrice: 1, price: { base: 1, effective: 1, original: 1, offer: null },
  variants: [{ pricePolicy: { mode: 'INHERITED', base: null }, price: { state: 'KNOWN', price: { base: 1, original: 1, effective: 1, offer: null } }, id: 'v', sku, name: 'Variante', status: 'ACTIVE', availability: 'AVAILABLE', optionValues: {}, attributes: { Material: 'Acero', Color: 'Negro' },
    inventory: { variantId: 'v', sku, state: 'KNOWN', available: 4, reserved: 2, onHand: 6, safety: 1, saleable: 3 } }] });
function withVariants(sku: string, variants: readonly (ReturnType<typeof productFixture>['variants'][number])[]) {
  return { ...productFixture(sku), variants,
    optionSnapshot: OptionWireMapper.fromWire(absentOptionSchema, variants.map(variant => ({ id: variant.id, sku: variant.sku, optionValues: {} }))) };
}

describe('ProductPage closed cart controls', () => {
  it('binds price and offer to the exact selection and blocks unknown variant prices', async () => {
    TestBed.configureTestingModule({imports:[ProductPageViewComponent],providers:[provideRouter([])]});
    const fixture=TestBed.createComponent(ProductPageViewComponent);
    const quote=(base:number,effective:number)=>({state:'KNOWN',price:{base,original:base,effective,offer:effective<base?{id:'O',name:'Oferta'}:null}});
    const base=productFixture('A');
    const raw=(sku:string,amount:number,effective=amount)=>({...base.variants[0],id:sku,sku,status:'ACTIVE',availability:'AVAILABLE',
      inventory:{sku,state:'KNOWN',available:4,reserved:0,safety:0,onHand:4,saleable:4},pricePolicy:{mode:'OVERRIDE',base:amount},price:quote(amount,effective)});
    fixture.componentRef.setInput('product',mapProductDetail({...base,optionSchema:absentOptionSchema,status:'ACTIVE',productBasePrice:1,variants:[raw('A',100),raw('B',200,150)]}));
    fixture.componentRef.setInput('access',CustomerCartAccess.Ready);
    fixture.detectChanges(); await fixture.whenStable();
    fixture.componentInstance.quantity=3;
    fixture.componentInstance.selectVariant('B'); fixture.detectChanges();
    expect(fixture.componentInstance.quantity).toBe(3);
    expect(fixture.componentInstance.selectedPrice?.effective).toBe(150);
    expect(fixture.nativeElement.querySelector('.sc-price--hero').textContent).toContain('150');
    expect(fixture.nativeElement.querySelector('.sc-price__was').textContent).toContain('200');
    const add=vi.fn();fixture.componentInstance.add.subscribe(add);fixture.componentInstance.submit('A');
    expect(add).toHaveBeenCalledWith({sku:'B',quantity:3});
    fixture.componentRef.setInput('product',mapProductDetail({...base,optionSchema:absentOptionSchema,status:'ACTIVE',productBasePrice:1,variants:[{...raw('A',100),price:undefined}]}));
    fixture.componentInstance.selectVariant('A'); fixture.detectChanges();
    expect(fixture.componentInstance.canPurchase).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Precio no disponible');
    expect(fixture.nativeElement.textContent).not.toContain('sin oferta');
  });
  it('selects the requested variant when opening and reusing routes for the same product', async () => {
    TestBed.configureTestingModule({ imports: [ProductPageViewComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ProductPageViewComponent);
    const variants = ['A', 'B'].map(sku => ({ ...productFixture(sku).variants[0], id: sku }));
    const product = (sku: string) => withVariants(sku, variants);
    fixture.componentRef.setInput('access', CustomerCartAccess.Ready);
    fixture.componentRef.setInput('product', product('B')); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.componentInstance.selectedVariant?.sku).toBe('B');
    const add = vi.fn(); fixture.componentInstance.add.subscribe(add);
    fixture.componentInstance.submit('B'); expect(add).toHaveBeenLastCalledWith({ sku: 'B', quantity: 1 });
    fixture.componentInstance.selectedVariantId = 'B'; fixture.componentInstance.quantity = 2;
    fixture.componentRef.setInput('product', product('A')); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.componentInstance.selectedVariant?.sku).toBe('A');
    expect(fixture.componentInstance.quantity).toBe(1);
    fixture.componentInstance.submit('A'); expect(add).toHaveBeenLastCalledWith({ sku: 'A', quantity: 1 });
    fixture.componentInstance.selectedVariantId = 'stale';
    expect(fixture.componentInstance.selectedVariant?.sku).toBe('A');
  });
  it('resets product-local gallery and quantity state when the reused route changes SKU', () => {
    TestBed.configureTestingModule({ imports: [ProductPageViewComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ProductPageViewComponent);
    const product = productFixture;
    fixture.componentRef.setInput('product', product('A', ['a-1.jpg', 'a-2.jpg']));
    fixture.detectChanges();
    fixture.componentInstance.activeImage = 'a-2.jpg';
    fixture.componentInstance.quantity = 4;
    fixture.componentRef.setInput('product', product('B', ['b-1.jpg']));
    fixture.detectChanges();
    expect(fixture.componentInstance.activeImage).toBe('');
    expect(fixture.componentInstance.quantity).toBe(1);
    expect((fixture.nativeElement.querySelector('.sc-zoom img') as HTMLImageElement).src).toContain('b-1.jpg');
  });

  it('orients dual USER sessions to CUSTOMER selection and emits no add until permitted', () => {
    TestBed.configureTestingModule({ imports: [ProductPageViewComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ProductPageViewComponent);
    fixture.componentRef.setInput('product', productFixture('sku'));
    fixture.componentRef.setInput('access', CustomerCartAccess.SelectCustomer);
    fixture.detectChanges();
    const add = vi.fn(); const requestAccess = vi.fn();
    fixture.componentInstance.add.subscribe(add);
    fixture.componentInstance.requestAccess.subscribe(requestAccess);
    expect(fixture.nativeElement.textContent).toContain(CustomerCartAccess.SelectCustomer.label);
    expect(fixture.nativeElement.querySelector('button[type=submit]')).not.toBeNull();
    fixture.componentInstance.submit('sku');
    expect(add).not.toHaveBeenCalled();
    expect(requestAccess).toHaveBeenCalledWith({ sku: 'sku', quantity: 1 });
    fixture.componentRef.setInput('access', CustomerCartAccess.Ready);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button[type=submit]').disabled).toBe(false);
    fixture.componentInstance.submit('sku');
    expect(add).toHaveBeenCalledWith({ sku: 'sku', quantity: 1 });
  });

  it('restores only the exact variant and announces option changes before applying them', () => {
    TestBed.configureTestingModule({ imports: [ProductPageViewComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ProductPageViewComponent);
    const variants = ['A', 'B'].map(sku => ({ ...productFixture(sku).variants[0], id: sku }));
    fixture.componentRef.setInput('product', withVariants('A', variants));
    fixture.componentRef.setInput('restoredSelection', { variantId: 'B', variantSku: 'B', optionValues: new Map(), quantity: 2, revision: 1 });
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedVariant?.sku).toBe('B');
    expect(fixture.componentInstance.quantity).toBe(2);
    const before = vi.fn(); fixture.componentInstance.requestSelectionChange.subscribe(request => { before(); request.apply(); });
    fixture.componentInstance.selectVariant('A');
    expect(before).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.quantity).toBe(2);
    fixture.componentRef.setInput('restoredSelection', { variantId: '', variantSku: 'missing', optionValues: new Map(), quantity: 2, revision: 2 });
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedVariant).toBeNull();
  });

  it('keeps focus while typing a multi-digit restored quantity and commits once', async () => {
    TestBed.configureTestingModule({ imports: [ProductPageViewComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ProductPageViewComponent);
    fixture.componentRef.setInput('product', productFixture('sku'));
    fixture.componentRef.setInput('access', CustomerCartAccess.Ready);
    fixture.componentRef.setInput('restoredSelection', { variantId: 'v', variantSku: 'sku', optionValues: new Map(), quantity: 2, revision: 1 });
    const revise = vi.fn(); fixture.componentInstance.reviseIntent.subscribe(revise);
    fixture.detectChanges(); await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('input[name=quantity]') as HTMLInputElement;
    input.focus(); input.value = '12'; input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement).toBe(input);
    expect(fixture.componentInstance.quantity).toBe(12);
    expect(revise).not.toHaveBeenCalled();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(revise).toHaveBeenCalledExactlyOnceWith({ sku: 'sku', quantity: 12 });
  });

  it('does not expose a different variant while intent confirmation is pending', async () => {
    TestBed.configureTestingModule({ imports: [ProductPageViewComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ProductPageViewComponent);
    const variants = ['A', 'B'].map(sku => ({ ...productFixture(sku).variants[0], id: sku }));
    fixture.componentRef.setInput('product', withVariants('A', variants));
    fixture.componentRef.setInput('intentBusy', true);
    fixture.detectChanges();
    await fixture.whenStable();
    const before = vi.fn(); fixture.componentInstance.requestSelectionChange.subscribe(() => before());
    fixture.componentInstance.selectVariant('B');
    expect(fixture.componentInstance.selectedVariant?.sku).toBe('A');
    expect(before).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('select[name=variant]').disabled).toBe(true);
  });

  it('preserves attribute order and blocks missing stock and quantities above saleable', async () => {
    TestBed.configureTestingModule({ imports: [ProductPageViewComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ProductPageViewComponent);
    const product = productFixture('sku');
    fixture.componentRef.setInput('product', product);
    fixture.componentRef.setInput('access', CustomerCartAccess.Ready);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(Array.from(fixture.nativeElement.querySelectorAll('dt') as NodeListOf<HTMLElement>).map(node => node.textContent)).toEqual(['Material', 'Color']);
    fixture.componentInstance.quantity = 3;
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Agregar una unidad"]').disabled).toBe(true);
    const add = vi.fn(); fixture.componentInstance.add.subscribe(add);
    fixture.componentInstance.quantity = 4; fixture.componentInstance.submit('sku');
    expect(add).not.toHaveBeenCalled();
    fixture.componentRef.setInput('product', mapProductDetail({ ...product, optionSchema: absentOptionSchema, status: 'ACTIVE', variants: [{ id: 'v', sku: 'sku', status: 'ACTIVE', availability: 'UNAVAILABLE', optionValues: {}, inventory: { sku: 'sku', state: 'MISSING', available: null, reserved: null, safety: null, onHand: null, saleable: null } }] }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin saldo registrado');
    expect(fixture.nativeElement.querySelector('button[type=submit]').disabled).toBe(true);
  });

  it('fails closed for unknown schemas and keeps a valid partial vector incomplete', () => {
    TestBed.configureTestingModule({ imports: [ProductPageViewComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ProductPageViewComponent);
    const variant = { ...productFixture('A').variants[0], id: 'A' };
    const unknown = { ...withVariants('A', [variant]), optionSnapshot: OptionWireMapper.fromWire(
      { revision: 1, state: 'UNKNOWN', cause: 'UNKNOWN', axes: [] }, [{ id: 'A', sku: 'A', optionValues: {} }]) };
    fixture.componentRef.setInput('product', unknown); fixture.detectChanges();
    expect(fixture.componentInstance.selectedVariant).toBeNull();
    expect(fixture.componentInstance.canPurchase).toBe(false);

    const schema = { revision: 1, state: 'VALID', cause: null, axes: [{ code: 'color', label: 'Color', presentation: 'SELECT', order: 0,
      values: [{ code: 'red', label: 'Rojo', order: 0 }, { code: 'blue', label: 'Azul', order: 1 }] }] };
    const variants = ['A', 'B'].map(sku => ({ ...productFixture(sku).variants[0], id: sku }));
    const partial = { ...withVariants('PRODUCT', variants), optionSnapshot: OptionWireMapper.fromWire(schema,
      variants.map((value, index) => ({ id: value.id, sku: value.sku, optionValues: { color: index === 0 ? 'red' : 'blue' } }))) };
    fixture.componentRef.setInput('product', partial); fixture.detectChanges();
    expect(fixture.componentInstance.selectedVariant).toBeNull();
    expect(fixture.componentInstance.canPurchase).toBe(false);
  });

  it('revalidates the same SKU when stock, price or schema changes', () => {
    TestBed.configureTestingModule({ imports: [ProductPageViewComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ProductPageViewComponent);
    fixture.componentRef.setInput('product', productFixture('sku')); fixture.detectChanges();
    expect(fixture.componentInstance.canPurchase).toBe(true);
    const base = productFixture('sku');
    const depleted = mapProductDetail({ ...base, optionSchema: absentOptionSchema, variants: [{ ...base.variants[0], optionValues: {},
      availability: 'OUT_OF_STOCK', inventory: { sku: 'sku', state: 'KNOWN', available: 0, reserved: 0, safety: 0, onHand: 0, saleable: 0 } }] });
    fixture.componentRef.setInput('product', depleted); fixture.detectChanges();
    expect(fixture.componentInstance.canPurchase).toBe(false);
    const noPrice = { ...base, variants: [{ ...base.variants[0], price: SkuPriceResolution.Unknown }] };
    fixture.componentRef.setInput('product', noPrice); fixture.detectChanges();
    expect(fixture.componentInstance.canPurchase).toBe(false);
    const unknown = { ...productFixture('sku'), optionSnapshot: OptionWireMapper.fromWire(
      { revision: 2, state: 'UNKNOWN', cause: 'UNKNOWN', axes: [] }, [{ id: 'v', sku: 'sku', optionValues: {} }]) };
    fixture.componentRef.setInput('product', unknown); fixture.detectChanges();
    expect(fixture.componentInstance.selectedVariant).toBeNull();
    expect(fixture.componentInstance.canPurchase).toBe(false);
  });
});
