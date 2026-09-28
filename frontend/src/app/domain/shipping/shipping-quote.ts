import { ShippingOption, ShippingOptionId } from './shipping.entity';

export function quoteShipping(subtotal: number): readonly ShippingOption[] {
  const base = Number.isFinite(subtotal) && subtotal > 0 ? subtotal : 0;
  return [
    { id: 'PICKUP', name: 'Retiro', price: 0, windowLabel: 'Lo retira el customer' },
    { id: 'STANDARD', name: 'Estándar', price: Math.max(1500, Math.round(base * 0.08)), windowLabel: '3 a 5 días' },
    { id: 'EXPRESS', name: 'Expreso', price: Math.max(3500, Math.round(base * 0.15)), windowLabel: '1 a 2 días' },
  ];
}

export function shippingPrice(subtotal: number, optionId: ShippingOptionId | null): number {
  return quoteShipping(subtotal).find((option) => option.id === optionId)?.price ?? 0;
}
