import type { OrderStatus, PaymentStatus, ShipmentStatus } from '../../domain/order/commerce-states';
import type { DemoCatalogSnapshot, DemoProductMedia } from '../catalog/catalog-model';
import type { DemoDeliverySnapshot, DemoPaymentMethod } from '../demo-process-types';
import type { DemoReservationState } from './demo-reservation-state';

export interface DemoAddress { id: string; label: string; street: string; city: string; postal: string; primary: boolean; }
export interface DemoCartLine { sku: string; variantId: string; quantity: number; quotedUnit: number; }
export interface DemoActor { id: string; addresses: DemoAddress[]; cart: DemoCartLine[]; }
export interface DemoOrderLine { sku: string; variantId: string; name: string; variantLabel: string; attributes: readonly { name: string; value: string }[]; image: DemoProductMedia; quantity: number; unit: number; }
export interface DemoOrder { id: string; actor: string; request: string; status: OrderStatus; payment: PaymentStatus; shipment: ShipmentStatus; lines: DemoOrderLine[]; total: number; address: string; tracking: string; history: string[]; method?: DemoPaymentMethod; delivery?: DemoDeliverySnapshot; reservation?: { state: DemoReservationState; lines: { sku: string; variantId: string; quantity: number }[] }; }
export interface DemoCheckoutSnapshot extends DemoCatalogSnapshot { actors: DemoActor[]; orders: DemoOrder[]; movements: { id: string; sku: string; variantId: string; delta: number; reason: string }[]; settings: { deliveryDays: number }; }
