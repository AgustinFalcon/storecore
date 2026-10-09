import { DemoContext, DemoSnapshot } from './demo-model';

/** Navigation intent is deliberately narrower than an arbitrary return URL. */
export class DemoAccessIntent {
  private constructor(readonly path: string) {}
  static readonly Unknown = new DemoAccessIntent('');
  static fromWire(raw: unknown): DemoAccessIntent {
    if (typeof raw !== 'string' || !/^\/demo(?:\/catalog\/[A-Za-z0-9:_-]+|\/cart|\/checkout|\/customer\/orders\/[A-Za-z0-9:_-]+|\/checkout\/result\/[A-Za-z0-9:_-]+|\/user\/(?:home|catalog|inventory|orders|offers|promos|content))?$/.test(raw)) return this.Unknown;
    return new DemoAccessIntent(raw);
  }
  destination(snapshot: DemoSnapshot, actor: string, context: DemoContext): string {
    const home = context === DemoContext.Admin ? '/demo/user/home' : '/demo';
    if (this === DemoAccessIntent.Unknown || context === DemoContext.Unknown) return home;
    if (this.path.startsWith('/demo/user/')) return context === DemoContext.Admin ? this.path : home;
    const id = this.path.match(/\/(?:orders|result)\/([^/]+)$/)?.[1];
    if (id && !snapshot.orders.some(order => order.id === id && order.actor === actor)) return home;
    if (context !== DemoContext.Customer && (this.path === '/demo/cart' || this.path === '/demo/checkout' || id)) return home;
    return this.path;
  }
}

export class DemoRecoveryPhase {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Request = new DemoRecoveryPhase('request', 'Solicitar recuperación');
  static readonly Sent = new DemoRecoveryPhase('sent', 'Solicitud recibida');
  static readonly Ready = new DemoRecoveryPhase('ready', 'Enlace de muestra válido');
  static readonly Expired = new DemoRecoveryPhase('expired', 'Enlace vencido');
  static readonly Used = new DemoRecoveryPhase('used', 'Enlace ya utilizado');
  static readonly Completed = new DemoRecoveryPhase('completed', 'Recuperación simulada completada');
  static readonly Unknown = new DemoRecoveryPhase('', 'Enlace no reconocido');
  static fromWire(raw: unknown): DemoRecoveryPhase { return [this.Request,this.Sent,this.Ready,this.Expired,this.Used,this.Completed].find(value=>value.wire===raw) ?? this.Unknown; }
}

export class DemoRecovery {
  private expires = 0;
  private consumed = false;
  private issued = false;
  constructor(private readonly now: () => number = Date.now) {}
  request(): DemoRecoveryPhase { this.expires = this.now()+300000; this.consumed=false; this.issued=true; return DemoRecoveryPhase.Sent; }
  inspect(): DemoRecoveryPhase { return !this.issued ? DemoRecoveryPhase.Unknown : this.consumed ? DemoRecoveryPhase.Used : this.now()>=this.expires ? DemoRecoveryPhase.Expired : DemoRecoveryPhase.Ready; }
  consume(): DemoRecoveryPhase { const phase=this.inspect(); if(phase!==DemoRecoveryPhase.Ready) return phase; this.consumed=true; return DemoRecoveryPhase.Completed; }
  expire(): DemoRecoveryPhase { this.expires=0; return this.inspect(); }
}

export function validateDemoIdentity(email: string, firstName: string, lastName: string, phone = ''): string {
  if (!firstName.trim() || firstName.length>80) return 'Nombre: ingresá entre 1 y 80 caracteres.';
  if (!lastName.trim() || lastName.length>80) return 'Apellido: ingresá entre 1 y 80 caracteres.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length>254) return 'Email: ingresá una dirección válida.';
  if (phone && !/^[+\d ()-]{6,30}$/.test(phone)) return 'Teléfono: usá entre 6 y 30 dígitos y separadores.';
  return '';
}
