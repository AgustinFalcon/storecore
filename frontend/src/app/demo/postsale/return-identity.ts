import type { DemoReturnRequest } from './postsale-types';

/** RMA IDs address commands globally, not only inside a single order. */
export class DemoReturnIdentity {
  static requireUnique(requests: readonly Pick<DemoReturnRequest, 'id'>[]): void {
    const ids = new Set<string>();
    for (const request of requests) {
      if (!request.id || ids.has(request.id)) throw new Error('Hay identidades de devolución duplicadas o inválidas.');
      ids.add(request.id);
    }
  }
}
