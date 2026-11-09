import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import { ProductPageViewComponent } from './product-page.view';
import { mapProductDetail } from '../../data/mappers/http-mappers';

const productFixture = (sku: string, images: string[] = []) => mapProductDetail({ id: 'p', sku, name: sku, status: 'ACTIVE', images,
  price: { base: 1, effective: 1, original: 1, offer: null },
  variants: [{ id: 'v', sku, name: 'Variante', status: 'ACTIVE', availability: 'AVAILABLE', attributes: { Material: 'Acero', Color: 'Negro' },
    inventory: { variantId: 'v', sku, state: 'KNOWN', available: 4, reserved: 2, onHand: 6, safety: 1, saleable: 3 } }] });

describe('ProductPage closed cart controls', () => {
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
    const add = vi.fn(); const select = vi.fn();
    fixture.componentInstance.add.subscribe(add);
    fixture.componentInstance.selectCustomer.subscribe(select);
    expect(fixture.nativeElement.textContent).toContain(CustomerCartAccess.SelectCustomer.label);
    expect(fixture.nativeElement.querySelector('button[type=submit]')).toBeNull();
    fixture.componentInstance.submit('sku');
    expect(add).not.toHaveBeenCalled();
    const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find((element) => element.textContent?.includes('Seleccionar contexto cliente'));
    button?.click(); expect(select).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('access', CustomerCartAccess.Ready);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button[type=submit]').disabled).toBe(false);
    fixture.componentInstance.submit('sku');
    expect(add).toHaveBeenCalledWith({ sku: 'sku', quantity: 1 });
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
