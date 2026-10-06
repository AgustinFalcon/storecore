import { Injectable } from '@angular/core';

/** Invalidates late unified-auth responses before they can install realm state. */
@Injectable({ providedIn: 'root' })
export class AccessMutationFence {
  private generation = 0;

  advance(): number {
    return ++this.generation;
  }

  snapshot(): number {
    return this.generation;
  }

  accepts(generation: number): boolean {
    return generation === this.generation;
  }
}
