import { Observable, map } from 'rxjs';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { AccessContext } from '../../domain/access/access-context';
import { ReturnDestination } from '../../domain/access/return-destination';
import { ContextAuthorityInspection } from '../../domain/access/session-probe';

export class CustomerRegistrationStage {
  private constructor(readonly label: string) {}
  static readonly Inspecting = new CustomerRegistrationStage('Comprobando la sesión…');
  static readonly InspectionRequired = new CustomerRegistrationStage('No pudimos comprobar la sesión actual.');
  static readonly Capture = new CustomerRegistrationStage('Completá tus datos.');
  static readonly Submitting = new CustomerRegistrationStage('Creando cuenta…');
  static readonly Reconciling = new CustomerRegistrationStage('Confirmando acceso…');
  static readonly ReconcileRequired = new CustomerRegistrationStage('Falta confirmar el acceso.');
  static readonly Complete = new CustomerRegistrationStage('Acceso confirmado.');
}

/** The router boundary is translated exactly once and never preserved as a raw path. */
export class CaptureReturnDestinationStep {
  capture(raw: unknown): ReturnDestination { return ReturnDestination.fromWire(raw); }
}

/** Registration is not authority until both the CUSTOMER principal and CSRF are freshly probed. */
export class ReconcileRegisteredCustomerStep {
  constructor(private readonly coordinator: AccessCoordinator) {}
  execute(): Observable<boolean> {
    return this.coordinator.reconcileRegisteredCustomer().pipe(map((state) =>
      state.activeContext === AccessContext.Customer && state.permits(AccessContext.Customer)));
  }
}

export class InspectRegisteredCustomerStep {
  constructor(private readonly coordinator: AccessCoordinator) {}
  execute(): Observable<ContextAuthorityInspection> { return this.coordinator.inspectCustomerAccess(); }
}

export class CompleteCustomerRegistrationStep {
  route(destination: ReturnDestination): string {
    return destination === ReturnDestination.Unknown
      ? '/customer/profile'
      : destination.routeFor(AccessContext.Customer) ?? '/customer/profile';
  }
}
