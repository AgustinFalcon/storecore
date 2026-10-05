import { Injectable } from '@angular/core';
import { catchError, concatMap, defer, EMPTY, Observable, Subject, Subscriber, tap } from 'rxjs';

/** Owns a dispatched request until its response updates the session's rotating CSRF token. */
class QueuedMutation<T> {
  constructor(
    private readonly request: () => Observable<T>,
    private readonly observer: Subscriber<T>,
    private readonly generation: number,
    private readonly currentGeneration: () => number,
  ) {}

  execute(): Observable<T> {
    if (this.observer.closed) return EMPTY;
    if (this.currentGeneration() !== this.generation) {
      this.observer.complete();
      return EMPTY;
    }
    return defer(this.request).pipe(
      tap({
        next: (value) => this.observer.next(value),
        error: (error: unknown) => this.observer.error(error),
        complete: () => this.observer.complete(),
      }),
      catchError(() => EMPTY),
    );
  }
}

/** Serial transport independent of component lifetime; errors terminate only their own task. */
class SessionMutationQueue {
  private readonly requests = new Subject<{ execute(): Observable<unknown> }>();

  constructor() {
    this.requests.pipe(concatMap((request) => request.execute())).subscribe();
  }

  enqueue<T>(request: () => Observable<T>, generation: number, currentGeneration: () => number): Observable<T> {
    return new Observable<T>((observer) => {
      this.requests.next(new QueuedMutation(request, observer, generation, currentGeneration));
      // Unsubscribing skips work still queued, but cannot abort an already dispatched write.
    });
  }
}

/** Separate root instances match the backend's independent USER and CUSTOMER sessions. */
@Injectable({ providedIn: 'root' })
export class UserMutationQueue extends SessionMutationQueue {}

@Injectable({ providedIn: 'root' })
export class CustomerMutationQueue extends SessionMutationQueue {}
