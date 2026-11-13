import { Injectable } from '@angular/core';
import { AccessContext } from '../../domain/access/access-context';
import { ReturnDestination } from '../../domain/access/return-destination';
import { PurchaseIntentCoordinator } from '../purchase-intent/purchase-intent-coordinator';

/** All access exits share this policy; only an accepted CUSTOMER may resume. */
@Injectable({ providedIn: 'root' })
export class ContinueCustomerPurchaseIntentPolicy {
  constructor(private readonly intents: PurchaseIntentCoordinator) {}
  reference(raw: unknown): string | null { return this.intents.validatedResumeReference(raw); }
  route(context: AccessContext, destination: ReturnDestination, authoritativeRoute: string, resume: unknown): string {
    if (context !== AccessContext.Customer || (destination !== ReturnDestination.Home && destination !== ReturnDestination.Catalog)) return authoritativeRoute;
    const continuation = this.intents.continuationForCustomer(resume);
    return continuation ? `/catalog/${encodeURIComponent(continuation.productSku)}?resume=${encodeURIComponent(continuation.flowId)}` : authoritativeRoute;
  }
}
