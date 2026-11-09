import { BoundedPageRequest } from '../../catalog/bounded-page';
import { BoundedRows } from '../../catalog/bounded-rows';
import { Observable } from 'rxjs';
import {
  InventoryRow,
  MercadoLibreAccount,
  MercadoLibreListing,
  MercadoLibreMapping,
} from '../user.entity';
import { IUserRepository } from '../user.repository';

export class ManageInstallationUseCase {
  constructor(private readonly repo: IUserRepository) {}

  listInventory(page = BoundedPageRequest.first()): Observable<BoundedRows<InventoryRow>> {
    return this.repo.listInventory(page);
  }

  readMercadoLibreAccount(): Observable<MercadoLibreAccount> {
    return this.repo.readMercadoLibreAccount();
  }

  listMercadoLibreListings(page = 0): Observable<BoundedRows<MercadoLibreListing>> {
    return this.repo.listMercadoLibreListings(page);
  }

  saveMercadoLibreListing(listing: MercadoLibreMapping): Observable<MercadoLibreListing> {
    return this.repo.saveMercadoLibreListing(listing);
  }
}
