import { BoundedPageRequest } from '../../domain/catalog/bounded-page';
import { BoundedRows } from '../../domain/catalog/bounded-rows';
import { CreateManualPromo, PolicyTransition } from '../../domain/user/channel-pricing';
import { mapChannelPage, mapChannelAccount, mapChannelListing, mapPricePolicy } from './channel-pricing.mapper';
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { readApiBody } from '../../core/api/base-response';
import { CatalogFacet } from '../../domain/catalog/catalog-facet.entity';
import { ProductDetail } from '../../domain/catalog/product-detail.entity';
import {
  CapabilityModule,
  InventoryRow,
  ManualPromo,
  MercadoLibreAccount,
  MercadoLibreListing,
  MercadoLibreMapping,
  ProfilePreview,
  UserCredentials,
  UserSessionResult,
} from '../../domain/user/user.entity';
import { IUserRepository } from '../../domain/user/user.repository';
import {
  mapCapabilities,
  mapFacet,
  mapInventory,
  mapPreview,
  mapProductDetail,
  mapProductDetails,
  mapUserSession,
} from '../mappers/http-mappers';

@Injectable()
export class UserHttpRepository implements IUserRepository {
  constructor(private readonly http: HttpClient) {}

  signIn(credentials: UserCredentials): Observable<UserSessionResult> {
    return this.http
      .post<unknown>(`${environment.apiBaseUrl}/internal/auth/login`, credentials)
      .pipe(map((body) => mapUserSession(readApiBody<unknown>(body))));
  }

  logout(): Observable<void> {
    return this.http.post(`${environment.apiBaseUrl}/internal/auth/logout`, {}, { observe: 'response' }).pipe(map(() => undefined));
  }

  readCsrf(): Observable<void> {
    return this.http.get(`${environment.apiBaseUrl}/internal/auth/csrf`, { observe: 'response' }).pipe(map(() => undefined));
  }

  readMe(): Observable<UserSessionResult> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/internal/me`)
      .pipe(map((body) => mapUserSession(readApiBody<unknown>(body))));
  }

  listPromos(page = 0): Observable<BoundedRows<ManualPromo>> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/user/promos`, { params: { page, size: 25 } })
      .pipe(map((body) => mapChannelPage(readApiBody<unknown>(body), mapPricePolicy)));
  }

  savePromo(promo: CreateManualPromo): Observable<ManualPromo> {
    return this.http
      .post<unknown>(`${environment.apiBaseUrl}/user/promos`, {
        listingSku: promo.listingSku, currency: promo.currency.wire, priceScope: promo.priceScope.wire,
        desiredPrice: promo.desiredPrice, effectivePromoPrice: promo.effectivePromoPrice,
        validFrom: promo.validFrom, validTo: promo.validTo, writer: promo.writer.wire,
      }).pipe(map((body) => mapPricePolicy(readApiBody<unknown>(body))));
  }

  transitionPromo(id: string, transition: PolicyTransition): Observable<ManualPromo> {
    return this.http.post<unknown>(`${environment.apiBaseUrl}/user/promos/${encodeURIComponent(id)}/state`, { transition: transition.wire })
      .pipe(map(body => mapPricePolicy(readApiBody(body))));
  }

  listCatalog(page = BoundedPageRequest.first()): Observable<BoundedRows<ProductDetail>> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/user/catalog`, { params: { page: page.page, size: page.size } })
      .pipe(map((body) => mapProductDetails(readApiBody<unknown>(body))));
  }

  saveProduct(product: ProductDetail): Observable<ProductDetail> {
    return this.http
      .put<unknown>(`${environment.apiBaseUrl}/user/catalog/products/${encodeURIComponent(product.sku)}`, {
        sku: product.sku, name: product.name, description: product.description, brand: product.brand, category: product.category,
        images: product.images, variants: product.variants.map(variant => ({ id: variant.id, sku: variant.sku, name: variant.name, status: variant.status.wire, attributes: variant.attributes })),
        price: { base: product.price.base }, status: product.status.wire,
      })
      .pipe(map((body) => mapProductDetail(readApiBody<unknown>(body))));
  }

  saveBrand(facet: CatalogFacet): Observable<CatalogFacet> {
    return this.http
      .put<unknown>(`${environment.apiBaseUrl}/user/catalog/brands/${facet.id}`, facet)
      .pipe(map((body) => mapFacet(readApiBody<unknown>(body))));
  }

  saveCategory(facet: CatalogFacet): Observable<CatalogFacet> {
    return this.http
      .put<unknown>(`${environment.apiBaseUrl}/user/catalog/categories/${facet.id}`, facet)
      .pipe(map((body) => mapFacet(readApiBody<unknown>(body))));
  }

  previewProfile(manifest: string): Observable<ProfilePreview> {
    return this.http
      .post<unknown>(`${environment.apiBaseUrl}/user/profiles/preview`, { manifest })
      .pipe(map((body) => mapPreview(readApiBody<unknown>(body))));
  }

  mergeProfile(manifest: string): Observable<ProfilePreview> {
    return this.http
      .post<unknown>(`${environment.apiBaseUrl}/user/profiles/merge`, { manifest })
      .pipe(map((body) => mapPreview(readApiBody<unknown>(body))));
  }

  listCapabilities(): Observable<readonly CapabilityModule[]> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/user/capabilities`)
      .pipe(map((body) => mapCapabilities(readApiBody<unknown>(body))));
  }

  listInventory(page = BoundedPageRequest.first()): Observable<BoundedRows<InventoryRow>> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/user/inventory`, { params: { page: page.page, size: page.size } })
      .pipe(map((body) => mapInventory(readApiBody<unknown>(body))));
  }

  readMercadoLibreAccount(): Observable<MercadoLibreAccount> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/user/mercadolibre/account`)
      .pipe(map((body) => mapChannelAccount(readApiBody<unknown>(body))));
  }

  listMercadoLibreListings(page = 0): Observable<BoundedRows<MercadoLibreListing>> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/user/mercadolibre/listings`, { params: { page, size: 25 } })
      .pipe(map((body) => mapChannelPage(readApiBody<unknown>(body), mapChannelListing)));
  }

  saveMercadoLibreListing(listing: MercadoLibreMapping): Observable<MercadoLibreListing> {
    return this.http
      .put<unknown>(`${environment.apiBaseUrl}/user/mercadolibre/listings/${listing.listingId}`, listing)
      .pipe(map((body) => mapChannelListing(readApiBody<unknown>(body))));
  }
}
