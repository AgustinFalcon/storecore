export function orderStatusLabel(status: string): string {
  switch (status) {
    case 'PAID':
      return 'confirmada';
    case 'PENDING_PAYMENT':
      return 'pago pendiente';
    case 'PENDING':
      return 'pendiente';
    case 'CREATED':
      return 'creada';
    default:
      return status.toLowerCase();
  }
}

export function paymentStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'pendiente';
    case 'APPROVED':
      return 'aprobado';
    case 'REJECTED':
      return 'rechazado';
    default:
      return status.toLowerCase();
  }
}

export function paymentMethodLabel(method: string | null | undefined): string {
  switch (method) {
    case 'MERCADO_PAGO':
      return 'Mercado Pago';
    case 'CASH':
      return 'efectivo en el local';
    default:
      return 'sin medio elegido';
  }
}

export function shipmentStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'pendiente';
    case 'PREPARING':
      return 'en preparación';
    case 'PACKED':
      return 'empaquetado';
    case 'SHIPPED':
      return 'enviado';
    case 'DELIVERED':
      return 'entregado';
    default:
      return status.toLowerCase();
  }
}
