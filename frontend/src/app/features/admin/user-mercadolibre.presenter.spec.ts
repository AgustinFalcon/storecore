import { maskMercadoLibreAccountRef, presentMercadoLibreListings } from './user-mercadolibre.presenter';

const listings = [
  { listingId: 'MLA-1', variationId: '', sku: 'TALADRO-01' },
  { listingId: 'MLA-2', variationId: 'AZUL', sku: 'TALADRO-01' },
  { listingId: 'MLA-3', variationId: 'ÚNICA', sku: 'SIERRA-02' },
];

describe('presentMercadoLibreListings', () => {
  it('summarizes the complete snapshot independently from the active search', () => {
    expect(presentMercadoLibreListings(listings, 'taladro')).toEqual({
      visibleListings: listings.slice(0, 2),
      mappingCount: 3,
      uniqueSkuCount: 2,
      variationCount: 2,
    });
  });

  it('searches listing, variation, and SKU without case or accent sensitivity', () => {
    expect(presentMercadoLibreListings(listings, ' unica ').visibleListings).toEqual([listings[2]]);
    expect(presentMercadoLibreListings(listings, 'MLA-2').visibleListings).toEqual([listings[1]]);
    expect(presentMercadoLibreListings(listings, 'missing').visibleListings).toEqual([]);
    expect(presentMercadoLibreListings(listings, '  ').visibleListings).toBe(listings);
  });

  it('never presents the complete account reference', () => {
    expect(maskMercadoLibreAccountRef('seller-123456')).toBe('••••3456');
    expect(maskMercadoLibreAccountRef('  12 ')).toBe('••••');
    expect(maskMercadoLibreAccountRef('')).toBe('Sin referencia');
  });
});
