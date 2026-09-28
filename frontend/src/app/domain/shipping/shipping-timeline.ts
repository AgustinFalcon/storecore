import { ShippingOptionId, ShippingSimStatus, ShippingStep } from './shipping.entity';

const PICKUP_PATH: readonly ShippingSimStatus[] = ['CONFIRMED', 'PREPARING', 'PACKED', 'READY_FOR_PICKUP'];
const SHIP_PATH: readonly ShippingSimStatus[] = ['CONFIRMED', 'PREPARING', 'PACKED', 'DISPATCHED', 'ARRIVING'];

export function pathFor(option: ShippingOptionId): readonly ShippingSimStatus[] {
  return option === 'PICKUP' ? PICKUP_PATH : SHIP_PATH;
}

export function nextSimStatus(option: ShippingOptionId, current: ShippingSimStatus): ShippingSimStatus | null {
  const path = pathFor(option);
  const index = path.indexOf(current);
  if (index < 0 || index >= path.length - 1) {
    return null;
  }
  return path[index + 1];
}

export function arrivalDate(option: ShippingOptionId, now: Date): Date | null {
  if (option === 'PICKUP') {
    return null;
  }
  const next = new Date(now.getTime());
  next.setUTCDate(next.getUTCDate() + (option === 'EXPRESS' ? 2 : 5));
  return next;
}

export function formatArrival(date: Date): string {
  const formatted = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
  return `Tu envío llega el ${formatted}`;
}

export function shippingSteps(option: ShippingOptionId, current: ShippingSimStatus, now: Date): readonly ShippingStep[] {
  const path = pathFor(option);
  const at = Math.max(0, path.indexOf(current));
  return path.map((id, index) => ({
    id,
    label: labelFor(id, option, now, index < at ? 'done' : index === at ? 'current' : 'upcoming'),
    detail: detailFor(id, index < at ? 'done' : index === at ? 'current' : 'upcoming'),
    state: index < at ? 'done' : index === at ? 'current' : 'upcoming',
  }));
}

function labelFor(
  id: ShippingSimStatus,
  option: ShippingOptionId,
  now: Date,
  state: ShippingStep['state'],
): string {
  switch (id) {
    case 'CONFIRMED':
      return 'Pedido confirmado';
    case 'PREPARING':
      return 'Pedido en preparación';
    case 'PACKED':
      return 'Empaquetado';
    case 'READY_FOR_PICKUP':
      return 'Listo para retirar';
    case 'DISPATCHED':
      return state === 'upcoming' ? 'Despacho' : 'El envío ya fue despachado';
    case 'ARRIVING': {
      const date = arrivalDate(option, now);
      if (!date) {
        return 'Llegada';
      }
      const formatted = new Intl.DateTimeFormat('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      }).format(date);
      return state === 'upcoming' ? `Llegada prevista el ${formatted}` : `Tu envío llega el ${formatted}`;
    }
  }
}

function detailFor(id: ShippingSimStatus, state: ShippingStep['state']): string {
  if (state === 'done') {
    switch (id) {
      case 'CONFIRMED':
        return 'Quedó confirmado en esta simulación.';
      case 'PREPARING':
        return 'El local ya armó el pedido.';
      case 'PACKED':
        return 'El paquete ya se cerró.';
      case 'READY_FOR_PICKUP':
        return 'Quedó listo para retirar. No salió con un correo.';
      case 'DISPATCHED':
        return 'Figura como despachado. Correo Argentino no está conectado.';
      case 'ARRIVING':
        return 'La fecha simulada ya quedó en el recorrido.';
    }
  }
  if (state === 'upcoming') {
    switch (id) {
      case 'CONFIRMED':
        return 'Todavía no está confirmado en esta simulación.';
      case 'PREPARING':
        return 'Después el local arma el pedido.';
      case 'PACKED':
        return 'Después se cierra el paquete.';
      case 'READY_FOR_PICKUP':
        return 'Después queda listo para retirar. No sale con un correo.';
      case 'DISPATCHED':
        return 'Después figura el despacho. Correo Argentino no está conectado.';
      case 'ARRIVING':
        return 'La fecha es simulada. Todavía no es la llegada.';
    }
  }
  switch (id) {
    case 'CONFIRMED':
      return 'La compra quedó registrada en esta simulación.';
    case 'PREPARING':
      return 'El local está armando el pedido.';
    case 'PACKED':
      return 'El paquete está cerrado.';
    case 'READY_FOR_PICKUP':
      return 'Se puede pasar a buscarlo. No sale con un correo.';
    case 'DISPATCHED':
      return 'Aviso simulado. Correo Argentino todavía no está conectado.';
    case 'ARRIVING':
      return 'Fecha simulada. No es un plazo de Correo Argentino.';
  }
}
