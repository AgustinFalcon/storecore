import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ProductDetail } from '../../domain/catalog/product-detail.entity';
import { ProductPageViewComponent } from './product-page.view';

function detail(partial: Partial<ProductDetail> = {}): ProductDetail {
  return {
    sku: 'SKU-1',
    name: 'Lámpara',
    description: 'De mesa',
    brand: 'Casa',
    category: 'Luz',
    images: [],
    variants: [],
    price: { base: 100, desired: null, observed: null, effective: 80, priceVersion: 'v1' },
    offerRef: 'O-1',
    active: true,
    ...partial,
  };
}

describe('product detail offer window', () => {
  const now = Date.now();
  const openFrom = new Date(now - 60 * 60 * 1000).toISOString();
  const openUntil = new Date(now + 60 * 60 * 1000).toISOString();
  const closedFrom = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  const closedUntil = new Date(now - 60 * 60 * 1000).toISOString();

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProductPageViewComponent],
      providers: [provideRouter([])],
    });
  });

  function render(product: ProductDetail): HTMLElement {
    const fixture = TestBed.createComponent(ProductPageViewComponent);
    fixture.componentRef.setInput('product', product);
    fixture.componentRef.setInput('signedIn', true);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('hides the offer badge outside the window and keeps the effective price', () => {
    const view = render(detail({ validFrom: closedFrom, validUntil: closedUntil }));
    expect(view.textContent).toContain('sin oferta');
    expect(view.textContent).not.toContain('oferta O-1');
    expect(view.textContent).toContain('80');
    expect(view.textContent).toContain('100');
    expect((view.querySelector('button.sc-btn--primary') as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the API offer inside the window and when the payload has no window', () => {
    const inside = render(detail({ validFrom: openFrom, validUntil: openUntil }));
    expect(inside.textContent).toContain('oferta O-1');

    const open = render(detail());
    expect(open.textContent).toContain('oferta O-1');
    expect(open.textContent).toContain('80');
  });

  it('keeps an inactive product off the cart button', () => {
    const view = render(detail({ active: false, validFrom: openFrom, validUntil: openUntil }));
    expect((view.querySelector('button.sc-btn--primary') as HTMLButtonElement).disabled).toBe(true);
  });
});
