export const environment = {
  production: false,
  apiBaseUrl: '/api/v1',
  /** Per-installation checkout return destinations. Empty is deliberately fail-closed. */
  checkoutAllowedOrigins: [] as readonly string[],
} as const;
