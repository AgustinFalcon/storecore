export class DemoPaymentMethod {
  private constructor(readonly wire: string, readonly label: string, readonly instruction: string) {}
  static readonly Card = new DemoPaymentMethod('card', 'Tarjeta', 'Tarjeta de muestra · no ingreses datos reales');
  static readonly QR = new DemoPaymentMethod('qr', 'QR', 'QR de muestra · confirmá el resultado en el simulador');
  static readonly Transfer = new DemoPaymentMethod('transfer', 'Transferencia', 'Alias DEMO.STORECORE · no transfieras dinero');
  static readonly Unknown = new DemoPaymentMethod('', 'Método desconocido', 'Elegí un método válido');
  static readonly all = [this.Card, this.QR, this.Transfer];
  static fromWire(raw: unknown): DemoPaymentMethod { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}
export class DemoPaymentPhase {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Ready = new DemoPaymentPhase('ready', 'Listo para pagar');
  static readonly Processing = new DemoPaymentPhase('processing', 'Procesando pago simulado…');
  static readonly Cancelled = new DemoPaymentPhase('cancelled', 'Pago cancelado; conservamos tu carrito');
  static readonly Unknown = new DemoPaymentPhase('', 'Estado desconocido');
  static fromWire(raw: unknown): DemoPaymentPhase { return [this.Ready, this.Processing, this.Cancelled].find(value => value.wire === raw) ?? this.Unknown; }
}
export class DemoDeliveryMethod {
  private constructor(readonly wire: string, readonly label: string, readonly cost: number, readonly days: number) {}
  static readonly Home = new DemoDeliveryMethod('home', 'Envío a domicilio', 350000, 5);
  static readonly Pickup = new DemoDeliveryMethod('pickup', 'Retiro en el comercio', 0, 1);
  static readonly Unknown = new DemoDeliveryMethod('', 'Entrega desconocida', 0, 0);
  static readonly all = [this.Home, this.Pickup];
  static fromWire(raw: unknown): DemoDeliveryMethod { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}
export class DemoMLTab {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Account = new DemoMLTab('account', 'Cuenta');
  static readonly Listings = new DemoMLTab('listings', 'Publicaciones');
  static readonly Stock = new DemoMLTab('stock', 'Stock');
  static readonly Activity = new DemoMLTab('activity', 'Actividad');
  static readonly Competition = new DemoMLTab('competition', 'Competencia');
  static readonly Unknown = new DemoMLTab('', 'Pestaña desconocida');
  static readonly all = [this.Account, this.Listings, this.Stock, this.Activity, this.Competition];
  static fromWire(raw: unknown): DemoMLTab { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}
export class DemoSyncStatus {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Queued = new DemoSyncStatus('queued', 'En cola');
  static readonly Confirmed = new DemoSyncStatus('confirmed', 'Confirmado (simulado)');
  static readonly Failed = new DemoSyncStatus('failed', 'Error recuperable');
  static readonly Superseded = new DemoSyncStatus('superseded', 'Reemplazado por intención más reciente');
  static readonly Unknown = new DemoSyncStatus('', 'Estado desconocido');
  static fromWire(raw: unknown): DemoSyncStatus { return [this.Queued, this.Confirmed, this.Failed, this.Superseded].find(value => value.wire === raw) ?? this.Unknown; }
}
export interface DemoDeliverySnapshot { method: DemoDeliveryMethod; cost: number; days: number; destination: string; }
export interface DemoSyncJob { id: string; sku: string; desired: number; status: DemoSyncStatus; created: string; }
export interface DemoCompetitor { id: string; name: string; price: number; history: number[]; unread: boolean; sku?: string; threshold?: number; enabled?: boolean; }
