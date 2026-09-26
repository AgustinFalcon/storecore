export function moneyWasSent(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}
