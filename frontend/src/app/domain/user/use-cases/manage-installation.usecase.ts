import { Inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { USER_REPOSITORY } from '../../../core/tokens/user.tokens';
import { CapabilityModuleState } from '../capability-module-state';
import {
  CapabilityModule,
  InventoryRow,
  MercadoLibreAccount,
  MercadoLibreListing,
} from '../user.entity';
import { IUserRepository } from '../user.repository';

@Injectable()
export class ManageInstallationUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly repo: IUserRepository) {}

  listCapabilities(): Observable<readonly CapabilityModule[]> {
    return this.repo.listCapabilities().pipe(
      map((items) => items.filter((item) => item.module.homologationVisible)),
    );
  }

  setCapability(current: CapabilityModule, state: CapabilityModuleState): Observable<CapabilityModule> {
    if (!current.module.homologationVisible) {
      throw new Error('Este módulo no forma parte de la consola de homologación.');
    }
    if (!current.state.isCurrent || !state.isCurrent) {
      throw new Error('El estado de capability no es reconocido.');
    }
    if (current.configVersion === null || !Number.isSafeInteger(current.configVersion) || current.configVersion <= 0) {
      throw new Error('Recargá la configuración antes de cambiar el estado.');
    }
    // Created once per user attempt, before any HTTP subscription or retry.
    return this.repo.setCapability({
      module: current.module,
      state,
      expectedConfigVersion: current.configVersion,
      correlationId: crypto.randomUUID(),
    });
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
