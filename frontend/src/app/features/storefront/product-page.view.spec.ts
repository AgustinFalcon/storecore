import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import { ProductPageViewComponent } from './product-page.view';

describe('ProductPage closed cart controls', () => {
  it('resets product-local gallery and quantity state when the reused route changes SKU', () => {
    TestBed.configureTestingModule({ imports: [ProductPageViewComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ProductPageViewComponent);
    const product = (sku: string, images: string[]) => ({ sku, name: sku, description: '', brand: '', category: '', images, variants: [], price: { base: 1, effective: 1, desired: null, observed: null, priceVersion: '1' }, offerRef: null, active: true });
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
    fixture.componentRef.setInput('product', { sku: 'sku', name: 'Product', description: '', brand: '', category: '', images: [], variants: [], price: { base: 1, effective: 1, desired: null, observed: null, priceVersion: '1' }, offerRef: null, active: true });
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
});
