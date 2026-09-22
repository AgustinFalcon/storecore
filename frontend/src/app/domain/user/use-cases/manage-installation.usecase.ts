import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { USER_REPOSITORY } from '../../../core/tokens/user.tokens';
import {
  CapabilityModule,
  CapabilityState,
  InventoryRow,
  MercadoLibreAccount,
  MercadoLibreListing,
} from '../user.entity';
import { IUserRepository } from '../user.repository';

@Injectable()
export class ManageInstallationUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly repo: IUserRepository) {}

  listCapabilities(): Observable<readonly CapabilityModule[]> {
    return this.repo.listCapabilities();
  }

  setCapability(module: string, state: CapabilityState): Observable<CapabilityModule> {
    return this.repo.setCapability(module, state);
  }

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
