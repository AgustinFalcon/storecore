import { ShippingChoice } from '../order/closed-status';
import { ShippingOption } from './shipping.entity';

export function quoteShipping(subtotal: number): readonly ShippingOption[] {
  const base = Number.isFinite(subtotal) && subtotal > 0 ? subtotal : 0;
  return [
    { id: ShippingChoice.Pickup, name: 'Retiro', price: 0, windowLabel: 'Lo retira el customer' },
    { id: ShippingChoice.Standard, name: 'Estándar', price: Math.max(1500, Math.round(base * 0.08)), windowLabel: '3 a 5 días' },
    { id: ShippingChoice.Express, name: 'Expreso', price: Math.max(3500, Math.round(base * 0.15)), windowLabel: '1 a 2 días' },
  ];
}

export function shippingPrice(subtotal: number, optionId: ShippingChoice | null): number {
  return quoteShipping(subtotal).find((option) => option.id === optionId)?.price ?? 0;
}
