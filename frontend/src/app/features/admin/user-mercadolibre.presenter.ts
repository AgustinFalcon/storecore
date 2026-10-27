import { MercadoLibreListing } from '../../domain/user/user.entity';

export interface MercadoLibrePresentation {
  readonly visibleListings: readonly MercadoLibreListing[];
  readonly mappingCount: number;
  readonly uniqueSkuCount: number;
  readonly variationCount: number;
}

export function presentMercadoLibreListings(
  listings: readonly MercadoLibreListing[],
  query: string,
): MercadoLibrePresentation {
  const needle = normalize(query);
  const visibleListings = needle
    ? listings.filter((listing) => [listing.listingId, listing.variationId, listing.sku].some((value) => normalize(value).includes(needle)))
    : listings;
  return {
    visibleListings,
    mappingCount: listings.length,
    uniqueSkuCount: new Set(listings.map((listing) => listing.sku)).size,
    variationCount: listings.filter((listing) => Boolean(listing.variationId)).length,
  };
}

export function maskMercadoLibreAccountRef(accountRef: string): string {
  const value = accountRef.trim();
  if (!value) return 'Sin referencia';
  if (value.length <= 4) return '••••';
  return `••••${value.slice(-4)}`;
}

function normalize(value: string): string {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR');
}
