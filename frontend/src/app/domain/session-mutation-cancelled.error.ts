/** Domain-level cancellation used when an async operation belongs to an old identity generation. */
export class SessionMutationCancelledError extends Error {
  constructor() {
    super('La mutación fue cancelada porque cambió la identidad de sesión.');
    this.name = 'SessionMutationCancelledError';
  }
}
