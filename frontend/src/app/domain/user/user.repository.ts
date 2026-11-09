import { BoundedPageRequest } from '../catalog/bounded-page';
import { BoundedRows } from '../catalog/bounded-rows';
import { CreateManualPromo, PolicyTransition } from './channel-pricing';
import { Observable } from 'rxjs';
import { CatalogFacet } from '../catalog/catalog-facet.entity';
import { ProductDetail } from '../catalog/product-detail.entity';
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
} from './user.entity';

export interface IUserRepository {
  signIn(credentials: UserCredentials): Observable<UserSessionResult>;
  logout(): Observable<void>;
  readCsrf(): Observable<void>;
  readMe(): Observable<UserSessionResult>;
  listPromos(page?: number): Observable<BoundedRows<ManualPromo>>;
  savePromo(promo: CreateManualPromo): Observable<ManualPromo>;
  transitionPromo(id: string, transition: PolicyTransition): Observable<ManualPromo>;
  listCatalog(page?: BoundedPageRequest): Observable<BoundedRows<ProductDetail>>;
  saveProduct(product: ProductDetail): Observable<ProductDetail>;
  saveBrand(facet: CatalogFacet): Observable<CatalogFacet>;
  saveCategory(facet: CatalogFacet): Observable<CatalogFacet>;
  previewProfile(manifest: string): Observable<ProfilePreview>;
  mergeProfile(manifest: string): Observable<ProfilePreview>;
  listCapabilities(): Observable<readonly CapabilityModule[]>;
  listInventory(page?: BoundedPageRequest): Observable<BoundedRows<InventoryRow>>;
  readMercadoLibreAccount(): Observable<MercadoLibreAccount>;
  listMercadoLibreListings(page?: number): Observable<BoundedRows<MercadoLibreListing>>;
  saveMercadoLibreListing(listing: MercadoLibreMapping): Observable<MercadoLibreListing>;
}
