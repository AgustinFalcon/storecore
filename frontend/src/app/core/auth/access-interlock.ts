import { Injectable } from '@angular/core';
import { defer, Observable } from 'rxjs';
import { AccessContext } from '../../domain/access/access-context';
import { CustomerSession } from './customer-session';
import { UserSession } from './user-session';
import { CustomerMutationQueue, UserMutationQueue } from './session-mutation-queue';

/** Access transitions borrow the same transport owners as existing commerce writes. */
@Injectable({ providedIn: 'root' })
export class AccessInterlock {
  constructor(private readonly customer: CustomerSession, private readonly user: UserSession,
    private readonly customerQueue: CustomerMutationQueue, private readonly userQueue: UserMutationQueue) {}

  run<T>(context: AccessContext, request: () => Observable<T>): Observable<T> {
    return defer(() => {
      const customerGeneration = this.customer.generation();
      const userGeneration = this.user.generation();
      const userRequest = () => this.userQueue.enqueue(request, userGeneration, () => this.user.generation());
      if (context === AccessContext.User) return userRequest();
      // Unified credentials can affect either realm: always acquire CUSTOMER then USER.
      return this.customerQueue.enqueue(context === AccessContext.Customer ? request : userRequest,
        customerGeneration, () => this.customer.generation());
    });
  }
}
