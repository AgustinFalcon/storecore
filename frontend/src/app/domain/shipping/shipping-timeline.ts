import { MilestonePaint } from '../order/order-milestone';
import { ShippingChoice } from '../order/closed-status';
import { ShippingSimStatus, ShippingStep } from './shipping.entity';

const PICKUP_PATH: readonly ShippingSimStatus[] = [
  ShippingSimStatus.Confirmed,
  ShippingSimStatus.Preparing,
  ShippingSimStatus.Packed,
  ShippingSimStatus.ReadyForPickup,
];
const SHIP_PATH: readonly ShippingSimStatus[] = [
  ShippingSimStatus.Confirmed,
  ShippingSimStatus.Preparing,
  ShippingSimStatus.Packed,
  ShippingSimStatus.Dispatched,
  ShippingSimStatus.Arriving,
];

export function pathFor(option: ShippingChoice): readonly ShippingSimStatus[] {
  if (option === ShippingChoice.Pickup) {
    return PICKUP_PATH;
  }
  if (option === ShippingChoice.Standard || option === ShippingChoice.Express) {
    return SHIP_PATH;
  }
  return [];
}

export function nextSimStatus(option: ShippingChoice, current: ShippingSimStatus): ShippingSimStatus | null {
  const path = pathFor(option);
  const index = path.indexOf(current);
  if (index < 0 || index >= path.length - 1) {
    return null;
  }
  return path[index + 1];
}

export function arrivalDate(option: ShippingChoice, now: Date): Date | null {
  if (option !== ShippingChoice.Standard && option !== ShippingChoice.Express) {
    return null;
  }
  const next = new Date(now.getTime());
  next.setUTCDate(next.getUTCDate() + (option === ShippingChoice.Express ? 2 : 5));
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

export function shippingSteps(option: ShippingChoice, current: ShippingSimStatus, now: Date): readonly ShippingStep[] {
  const path = pathFor(option);
  const at = path.indexOf(current);
  if (at < 0) {
    if (current === ShippingSimStatus.Unknown && path.length > 0) {
      return [
        {
          id: ShippingSimStatus.Unknown,
          label: 'Estado no reconocido',
          detail: 'Esta simulación no avanza un estado que no conoce.',
          state: MilestonePaint.Current,
        },
      ];
    }
    return [];
  }
  return path.map((id, index) => ({
    id,
    label: labelFor(id, option, now, index < at ? MilestonePaint.Done : index === at ? MilestonePaint.Current : MilestonePaint.Upcoming),
    detail: detailFor(id, index < at ? MilestonePaint.Done : index === at ? MilestonePaint.Current : MilestonePaint.Upcoming),
    state: index < at ? MilestonePaint.Done : index === at ? MilestonePaint.Current : MilestonePaint.Upcoming,
  }));
}

function labelFor(id: ShippingSimStatus, option: ShippingChoice, now: Date, state: MilestonePaint): string {
  if (id === ShippingSimStatus.Confirmed) {
    return 'Pedido confirmado';
  }
  if (id === ShippingSimStatus.Preparing) {
    return 'Pedido en preparación';
  }
  if (id === ShippingSimStatus.Packed) {
    return 'Empaquetado';
  }
  if (id === ShippingSimStatus.ReadyForPickup) {
    return 'Listo para retirar';
  }
  if (id === ShippingSimStatus.Dispatched) {
    return state === MilestonePaint.Upcoming ? 'Despacho' : 'El envío ya fue despachado';
  }
  if (id === ShippingSimStatus.Arriving) {
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
    return state === MilestonePaint.Upcoming ? `Llegada prevista el ${formatted}` : `Tu envío llega el ${formatted}`;
  }
  return id.label;
}

function detailFor(id: ShippingSimStatus, state: MilestonePaint): string {
  if (state === MilestonePaint.Done) {
    if (id === ShippingSimStatus.Confirmed) {
      return 'Quedó confirmado en esta simulación.';
    }
    if (id === ShippingSimStatus.Preparing) {
      return 'El local ya armó el pedido.';
    }
    if (id === ShippingSimStatus.Packed) {
      return 'El paquete ya se cerró.';
    }
    if (id === ShippingSimStatus.ReadyForPickup) {
      return 'Quedó listo para retirar. No salió con un correo.';
    }
    if (id === ShippingSimStatus.Dispatched) {
      return 'Figura como despachado. Correo Argentino no está conectado.';
    }
    if (id === ShippingSimStatus.Arriving) {
      return 'La fecha simulada ya quedó en el recorrido.';
    }
  }
  if (state === MilestonePaint.Upcoming) {
    if (id === ShippingSimStatus.Confirmed) {
      return 'Todavía no está confirmado en esta simulación.';
    }
    if (id === ShippingSimStatus.Preparing) {
      return 'Después el local arma el pedido.';
    }
    if (id === ShippingSimStatus.Packed) {
      return 'Después se cierra el paquete.';
    }
    if (id === ShippingSimStatus.ReadyForPickup) {
      return 'Después queda listo para retirar. No sale con un correo.';
    }
    if (id === ShippingSimStatus.Dispatched) {
      return 'Después figura el despacho. Correo Argentino no está conectado.';
    }
    if (id === ShippingSimStatus.Arriving) {
      return 'La fecha es simulada. Todavía no es la llegada.';
    }
  }
  if (id === ShippingSimStatus.Confirmed) {
    return 'La compra quedó registrada en esta simulación.';
  }
  if (id === ShippingSimStatus.Preparing) {
    return 'El local está armando el pedido.';
  }
  if (id === ShippingSimStatus.Packed) {
    return 'El paquete está cerrado.';
  }
  if (id === ShippingSimStatus.ReadyForPickup) {
    return 'Se puede pasar a buscarlo. No sale con un correo.';
  }
  if (id === ShippingSimStatus.Dispatched) {
    return 'Aviso simulado. Correo Argentino todavía no está conectado.';
  }
  if (id === ShippingSimStatus.Arriving) {
    return 'Fecha simulada. No es un plazo de Correo Argentino.';
  }
  return 'Esta simulación no avanza un estado que no conoce.';
}
