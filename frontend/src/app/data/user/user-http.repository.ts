import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { readApiBody } from '../../core/api/base-response';
import { CatalogFacet } from '../../domain/catalog/catalog-facet.entity';
import { ProductDetail } from '../../domain/catalog/product-detail.entity';
import {
  CapabilityModule,
  CapabilityState,
  HomeContentDraft,
  InventoryRow,
  ManualPromo,
  MercadoLibreAccount,
  MercadoLibreListing,
  ProfilePreview,
  UserCredentials,
  UserSessionResult,
} from '../../domain/user/user.entity';
import { IUserRepository } from '../../domain/user/user.repository';
import {
  homeDraftSavePayload,
  mapCapabilities,
  mapCapability,
  mapFacet,
  mapHomeDraft,
  mapInventory,
  mapListing,
  mapListings,
  mapMercadoLibreAccount,
  mapPreview,
  mapProductDetail,
  mapProductDetails,
  mapPromo,
  mapPromos,
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

  readHome(): Observable<HomeContentDraft> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/user/content/home`)
      .pipe(map((body) => mapHomeDraft(readApiBody<unknown>(body))));
  }

  saveHome(draft: HomeContentDraft): Observable<HomeContentDraft> {
    return this.http
      .put<unknown>(`${environment.apiBaseUrl}/user/content/home`, homeDraftSavePayload(draft))
      .pipe(map((body) => mapHomeDraft(readApiBody<unknown>(body))));
  }

  listPromos(): Observable<readonly ManualPromo[]> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/user/promos`)
      .pipe(map((body) => mapPromos(readApiBody<unknown>(body))));
  }

  savePromo(promo: ManualPromo): Observable<ManualPromo> {
    return this.http
      .post<unknown>(`${environment.apiBaseUrl}/user/promos`, promo)
      .pipe(map((body) => mapPromo(readApiBody<unknown>(body))));
  }

  listCatalog(): Observable<readonly ProductDetail[]> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/user/catalog`)
      .pipe(map((body) => mapProductDetails(readApiBody<unknown>(body))));
  }

  saveProduct(product: ProductDetail): Observable<ProductDetail> {
    return this.http
      .put<unknown>(`${environment.apiBaseUrl}/user/catalog/products/${product.sku}`, product)
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

  setCapability(module: string, state: CapabilityState): Observable<CapabilityModule> {
    return this.http
      .post<unknown>(`${environment.apiBaseUrl}/user/capabilities/${module}/state`, { state })
      .pipe(map((body) => mapCapability(readApiBody<unknown>(body))));
  }

  listInventory(): Observable<readonly InventoryRow[]> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/user/inventory`)
      .pipe(map((body) => mapInventory(readApiBody<unknown>(body))));
  }

  readMercadoLibreAccount(): Observable<MercadoLibreAccount> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/user/mercadolibre/account`)
      .pipe(map((body) => mapMercadoLibreAccount(readApiBody<unknown>(body))));
  }

  listMercadoLibreListings(): Observable<readonly MercadoLibreListing[]> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/user/mercadolibre/listings`)
      .pipe(map((body) => mapListings(readApiBody<unknown>(body))));
  }

  saveMercadoLibreListing(listing: MercadoLibreListing): Observable<MercadoLibreListing> {
    return this.http
      .put<unknown>(`${environment.apiBaseUrl}/user/mercadolibre/listings/${listing.listingId}`, listing)
      .pipe(map((body) => mapListing(readApiBody<unknown>(body))));
  }
}
