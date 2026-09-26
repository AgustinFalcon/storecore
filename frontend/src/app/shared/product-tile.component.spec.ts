import { ProductSummary } from '../domain/catalog/product-summary.entity';
import { ProductTileComponent } from './product-tile.component';

const past = { validFrom: '2000-01-01T00:00:00.000Z', validUntil: '2000-01-02T00:00:00.000Z' };
const open = { validFrom: '2000-01-01T00:00:00.000Z', validUntil: '2099-01-01T00:00:00.000Z' };

describe('ProductTileComponent offer badge', () => {
  it('hides the offers-filter badge outside the window without changing the price', () => {
    const tile = new ProductTileComponent();
    tile.product = card(past);
    tile.offer = true;

    expect(tile.showOffer).toBe(false);
    expect(tile.product.price).toBe(80);
    expect(tile.product.offerRef).toBe('O-1');
  });

  it('keeps the badge inside the window and when the payload has no window', () => {
    const openTile = new ProductTileComponent();
    openTile.product = card(open);
    expect(openTile.showOffer).toBe(true);

    const plain = new ProductTileComponent();
    plain.product = card();
    plain.offer = true;
    expect(plain.showOffer).toBe(true);
    expect(plain.product.offerRef).toBe('O-1');
  });
});

function card(window?: { validFrom: string; validUntil: string }): ProductSummary {
  return {
    sku: 'SKU-1',
    name: 'Lámpara',
    price: 80,
    originalPrice: 100,
    imageUrl: null,
    offerRef: 'O-1',
    ...(window ?? {}),
  };
}
