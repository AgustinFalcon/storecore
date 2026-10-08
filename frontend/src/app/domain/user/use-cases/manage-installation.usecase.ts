import { catchError, map, Observable, of, switchMap, throwError, timeout } from 'rxjs';
import { CapabilityCommandStatus } from '../capability-command-status';
import { UserRole } from '../user-role';
import { CapabilityModuleState } from '../capability-module-state';
import {
  CapabilityModule,
  InventoryRow,
  MercadoLibreAccount,
  MercadoLibreListing,
} from '../user.entity';
import { IUserRepository } from '../user.repository';

export class ManageInstallationUseCase {
  constructor(private readonly repo: IUserRepository) {}

  canChangeCapabilities(): Observable<boolean> {
    return this.repo.readMe().pipe(map(actor => actor.roles.includes(UserRole.Admin)), catchError(() => of(false)));
  }

  listCapabilities(): Observable<readonly CapabilityModule[]> {
    return this.repo.listCapabilities().pipe(
      map((items) => items.filter((item) => item.module.homologationVisible)),
    );
  }

  setCapability(current: CapabilityModule, state: CapabilityModuleState, reason: string): Observable<CapabilityModule> {
    if (!current.module.homologationVisible) {
      throw new Error('Este módulo no forma parte de la consola de homologación.');
    }
    if (!current.state.isCurrent || !state.isCurrent) {
      throw new Error('El estado de capability no es reconocido.');
    }
    if (current.configVersion === null || !Number.isSafeInteger(current.configVersion) || current.configVersion <= 0) {
      throw new Error('Recargá la configuración antes de cambiar el estado.');
    }
    if (!reason.trim()) throw new Error('Ingresá el motivo del cambio.');
    // Created once per user attempt, before any HTTP subscription or retry.
    const command = {
      module: current.module,
      state,
      reason,
      expectedConfigVersion: current.configVersion,
      correlationId: crypto.randomUUID(),
    };
    return this.repo.setCapability(command).pipe(
      timeout(15000),
      catchError(() => this.repo.capabilityCommandStatus(command.correlationId).pipe(
        timeout(15000),
        catchError(() => of(CapabilityCommandStatus.Unknown)),
        switchMap(status => this.listCapabilities().pipe(
          timeout(15000),
          switchMap(items => throwError(() => new CapabilityReconciliationError(items, status))),
        )),
      )),
    );
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

export class CapabilityReconciliationError extends Error {
  constructor(readonly snapshot: readonly CapabilityModule[], status: CapabilityCommandStatus) {
    super(`Resultado del comando: ${status.label}. Configuración actualizada desde el servidor; revisá antes de intentar otro cambio.`);
  }
}
