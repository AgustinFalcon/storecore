import { Observable } from 'rxjs';
import { CatalogFacet } from '../catalog/catalog-facet.entity';
import { ProductDetail } from '../catalog/product-detail.entity';
import {
  CapabilityModule,
  CapabilityStateCommand,
  HomeContentDraft,
  InventoryRow,
  ManualPromo,
  MercadoLibreAccount,
  MercadoLibreListing,
  ProfilePreview,
  UserCredentials,
  UserSessionResult,
} from './user.entity';

export interface IUserRepository {
  signIn(credentials: UserCredentials): Observable<UserSessionResult>;
  logout(): Observable<void>;
  readCsrf(): Observable<void>;
  readMe(): Observable<UserSessionResult>;
  readHome(): Observable<HomeContentDraft>;
  saveHome(draft: HomeContentDraft): Observable<HomeContentDraft>;
  listPromos(): Observable<readonly ManualPromo[]>;
  savePromo(promo: ManualPromo): Observable<ManualPromo>;
  listCatalog(): Observable<readonly ProductDetail[]>;
  saveProduct(product: ProductDetail): Observable<ProductDetail>;
  saveBrand(facet: CatalogFacet): Observable<CatalogFacet>;
  saveCategory(facet: CatalogFacet): Observable<CatalogFacet>;
  previewProfile(manifest: string): Observable<ProfilePreview>;
  mergeProfile(manifest: string): Observable<ProfilePreview>;
  listCapabilities(): Observable<readonly CapabilityModule[]>;
  setCapability(command: CapabilityStateCommand): Observable<CapabilityModule>;
  listInventory(): Observable<readonly InventoryRow[]>;
  readMercadoLibreAccount(): Observable<MercadoLibreAccount>;
  listMercadoLibreListings(): Observable<readonly MercadoLibreListing[]>;
  saveMercadoLibreListing(listing: MercadoLibreListing): Observable<MercadoLibreListing>;
}
