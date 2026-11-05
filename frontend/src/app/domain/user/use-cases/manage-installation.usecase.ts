import { Observable } from 'rxjs';
import {
  InventoryRow,
  MercadoLibreAccount,
  MercadoLibreListing,
} from '../user.entity';
import { IUserRepository } from '../user.repository';

export class ManageInstallationUseCase {
  constructor(private readonly repo: IUserRepository) {}

  listInventory(): Observable<readonly InventoryRow[]> {
    return this.repo.listInventory();
  }

  readMercadoLibreAccount(): Observable<MercadoLibreAccount> {
    return this.repo.readMercadoLibreAccount();
  }

  listMercadoLibreListings(): Observable<readonly MercadoLibreListing[]> {
    return this.repo.listMercadoLibreListings();
  }

  saveMercadoLibreListing(listing: MercadoLibreListing): Observable<MercadoLibreListing> {
    return this.repo.saveMercadoLibreListing(listing);
  }
}
