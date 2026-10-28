/** Shared Home and preview formatting of integer ARS minor units. */
export function demoMoney(value: number): string { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value / 100); }
