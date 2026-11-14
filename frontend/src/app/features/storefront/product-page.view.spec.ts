import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import { ProductPageViewComponent } from './product-page.view';
import { mapProductDetail } from '../../data/mappers/http-mappers';

const productFixture = (sku: string, images: string[] = []) => mapProductDetail({ id: 'p', sku, name: sku, status: 'ACTIVE', images,
  productBasePrice: 1, price: { base: 1, effective: 1, original: 1, offer: null },
  variants: [{ pricePolicy: { mode: 'INHERITED', base: null }, price: { state: 'KNOWN', price: { base: 1, original: 1, effective: 1, offer: null } }, id: 'v', sku, name: 'Variante', status: 'ACTIVE', availability: 'AVAILABLE', attributes: { Material: 'Acero', Color: 'Negro' },
    inventory: { variantId: 'v', sku, state: 'KNOWN', available: 4, reserved: 2, onHand: 6, safety: 1, saleable: 3 } }] });

describe('ProductPage closed cart controls', () => {
  it('binds price and offer to the exact selection and blocks unknown variant prices', async () => {
    TestBed.configureTestingModule({imports:[ProductPageViewComponent],providers:[provideRouter([])]});
    const fixture=TestBed.createComponent(ProductPageViewComponent);
    const quote=(base:number,effective:number)=>({state:'KNOWN',price:{base,original:base,effective,offer:effective<base?{id:'O',name:'Oferta'}:null}});
    const base=productFixture('A');
    const raw=(sku:string,amount:number,effective=amount)=>({...base.variants[0],id:sku,sku,status:'ACTIVE',availability:'AVAILABLE',
      inventory:{sku,state:'KNOWN',available:4,reserved:0,safety:0,onHand:4,saleable:4},pricePolicy:{mode:'OVERRIDE',base:amount},price:quote(amount,effective)});
    fixture.componentRef.setInput('product',mapProductDetail({...base,status:'ACTIVE',productBasePrice:1,variants:[raw('A',100),raw('B',200,150)]}));
    fixture.componentRef.setInput('access',CustomerCartAccess.Ready);
    fixture.detectChanges(); await fixture.whenStable();
    fixture.componentInstance.quantity=3;
    fixture.componentInstance.selectVariant('B'); fixture.detectChanges();
    expect(fixture.componentInstance.quantity).toBe(1);
    expect(fixture.componentInstance.selectedPrice?.effective).toBe(150);
    expect(fixture.nativeElement.querySelector('.sc-price--hero').textContent).toContain('150');
    expect(fixture.nativeElement.querySelector('.sc-price__was').textContent).toContain('200');
    const add=vi.fn();fixture.componentInstance.add.subscribe(add);fixture.componentInstance.submit('A');
    expect(add).toHaveBeenCalledWith({sku:'B',quantity:1});
    fixture.componentRef.setInput('product',mapProductDetail({...base,status:'ACTIVE',productBasePrice:1,variants:[{...raw('A',100),price:undefined}]}));
    fixture.componentInstance.selectVariant('A'); fixture.detectChanges();
    expect(fixture.componentInstance.canPurchase).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Precio no disponible');
    expect(fixture.nativeElement.textContent).not.toContain('sin oferta');
  });
  it('selects the requested variant when opening and reusing routes for the same product', async () => {
    TestBed.configureTestingModule({ imports: [ProductPageViewComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ProductPageViewComponent);
    const variants = ['A', 'B'].map(sku => ({ ...productFixture(sku).variants[0], id: sku }));
    const product = (sku: string) => ({ ...productFixture(sku), variants });
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
    expect(fixture.componentInstance.selectedVariant).toBeNull();
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

  it('restores only the exact variant and reports explicit corrections', () => {
    TestBed.configureTestingModule({ imports: [ProductPageViewComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ProductPageViewComponent);
    const variants = ['A', 'B'].map(sku => ({ ...productFixture(sku).variants[0], id: sku }));
    fixture.componentRef.setInput('product', { ...productFixture('A'), variants });
    fixture.componentRef.setInput('restoredSelection', { variantSku: 'B', quantity: 2, revision: 1 });
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedVariant?.sku).toBe('B');
    expect(fixture.componentInstance.quantity).toBe(2);
    const revise = vi.fn(); fixture.componentInstance.reviseIntent.subscribe(revise);
    fixture.componentInstance.selectVariant('A');
    expect(revise).toHaveBeenCalledWith({ sku: 'A', quantity: 1 });
    fixture.componentRef.setInput('restoredSelection', { variantSku: 'missing', quantity: 2, revision: 2 });
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedVariant).toBeNull();
  });

  it('keeps focus while typing a multi-digit restored quantity and commits once', async () => {
    TestBed.configureTestingModule({ imports: [ProductPageViewComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ProductPageViewComponent);
    fixture.componentRef.setInput('product', productFixture('sku'));
    fixture.componentRef.setInput('access', CustomerCartAccess.Ready);
    fixture.componentRef.setInput('restoredSelection', { variantSku: 'sku', quantity: 2, revision: 1 });
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
    fixture.componentRef.setInput('product', mapProductDetail({ ...product, status: 'ACTIVE', variants: [{ id: 'v', sku: 'sku', status: 'ACTIVE', availability: 'UNAVAILABLE', inventory: { sku: 'sku', state: 'MISSING', available: null, reserved: null, safety: null, onHand: null, saleable: null } }] }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin saldo registrado');
    expect(fixture.nativeElement.querySelector('button[type=submit]').disabled).toBe(true);
  });
});
