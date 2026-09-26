import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { emptyCatalogQuery } from '../../domain/catalog/catalog-query.entity';
import { ProductSummary } from '../../domain/catalog/product-summary.entity';
import { CatalogPageViewComponent } from './catalog-page.view';
import { CatalogState } from './catalog.store';

function product(partial: Partial<ProductSummary> & Pick<ProductSummary, 'sku' | 'name'>): ProductSummary {
  return {
    price: 80,
    originalPrice: 100,
    imageUrl: null,
    offerRef: 'O-1',
    ...partial,
  };
}

function state(products: readonly ProductSummary[], offersOnly: boolean): CatalogState {
  return {
    loading: false,
    errorMessage: '',
    query: { ...emptyCatalogQuery, offersOnly },
    products,
    brands: [],
    categories: [],
    home: null,
    offers: [],
    product: null,
  };
}

describe('catalog grid offer window', () => {
  const now = Date.now();
  const openFrom = new Date(now - 60 * 60 * 1000).toISOString();
  const openUntil = new Date(now + 60 * 60 * 1000).toISOString();
  const closedFrom = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  const closedUntil = new Date(now - 60 * 60 * 1000).toISOString();

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CatalogPageViewComponent],
      providers: [provideRouter([])],
    });
  });

  it('keeps every product and hides Oferta only outside that product window', () => {
    const fixture = TestBed.createComponent(CatalogPageViewComponent);
    fixture.componentRef.setInput(
      'state',
      state(
        [
          product({ sku: 'OUT', name: 'Fuera', validFrom: closedFrom, validUntil: closedUntil }),
          product({ sku: 'IN', name: 'Dentro', validFrom: openFrom, validUntil: openUntil }),
          product({ sku: 'OPEN', name: 'Sin ventana' }),
          product({ sku: 'PLAIN', name: 'Sin referencia', offerRef: null }),
        ],
        true,
      ),
    );
    fixture.detectChanges();

    const tiles = [...fixture.nativeElement.querySelectorAll('article.sc-tile')] as HTMLElement[];
    expect(tiles).toHaveLength(4);

    const tile = (name: string) => {
      const found = tiles.find((item) => item.textContent?.includes(name));
      expect(found).toBeTruthy();
      return found as HTMLElement;
    };

    const outside = tile('Fuera');
    expect(outside.querySelector('.sc-off')).toBeNull();
    expect(outside.textContent).toContain('80');
    expect(outside.textContent).toContain('100');
    expect(tile('Dentro').querySelector('.sc-off')).not.toBeNull();
    expect(tile('Sin ventana').querySelector('.sc-off')).not.toBeNull();
    expect(tile('Sin referencia').querySelector('.sc-off')).not.toBeNull();
  });
});
