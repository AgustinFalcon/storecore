import { DemoContext, DemoSnapshot } from './demo-model';

/** Navigation intent is deliberately narrower than an arbitrary return URL. */
export class DemoAccessIntent {
  private constructor(readonly path: string) {}
  static readonly Unknown = new DemoAccessIntent('');
  static fromWire(raw: unknown): DemoAccessIntent {
    if (typeof raw !== 'string' || !/^\/demo(?:\/catalog\/[A-Za-z0-9:_-]+|\/cart|\/checkout|\/customer\/(?:profile|addresses|favorites|orders(?:\/[A-Za-z0-9:_-]+)?)|\/checkout\/result\/[A-Za-z0-9:_-]+|\/user\/(?:home|customers|catalog|inventory|orders|offers|promos|content|capabilities|profile-import))?$/.test(raw)) return this.Unknown;
    return new DemoAccessIntent(raw);
  }
  destination(snapshot: DemoSnapshot, actor: string, context: DemoContext): string {
    const home = context === DemoContext.Admin ? '/demo/user/home' : '/demo';
    if (this === DemoAccessIntent.Unknown || context === DemoContext.Unknown) return home;
    if (this.path.startsWith('/demo/user/')) return context === DemoContext.Admin ? this.path : home;
    const id = this.path.match(/\/(?:orders|result)\/([^/]+)$/)?.[1];
    if (id && !snapshot.orders.some(order => order.id === id && order.actor === actor)) return home;
    if (context !== DemoContext.Customer && (this.path === '/demo/cart' || this.path === '/demo/checkout' || this.path.startsWith('/demo/customer/') || id)) return home;
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

interface RecoveryState { phase: DemoRecoveryPhase; expires: number; }
class RecoveryRequestStep {
  apply(state:RecoveryState,now:number):DemoRecoveryPhase {state.expires=now+300000;return state.phase=DemoRecoveryPhase.Sent;}
}
class RecoveryInspectionStep {
  apply(state:RecoveryState,now:number):DemoRecoveryPhase {
    if(state.phase===DemoRecoveryPhase.Request||state.phase===DemoRecoveryPhase.Unknown)return DemoRecoveryPhase.Unknown;
    if(state.phase===DemoRecoveryPhase.Completed||state.phase===DemoRecoveryPhase.Used)return state.phase=DemoRecoveryPhase.Used;
    return state.phase=now>=state.expires?DemoRecoveryPhase.Expired:DemoRecoveryPhase.Ready;
  }
}
class RecoveryCompletionStep {
  apply(state:RecoveryState):DemoRecoveryPhase {return state.phase===DemoRecoveryPhase.Ready?state.phase=DemoRecoveryPhase.Completed:state.phase;}
}
/** Recovery owns only local simulation state; each lifecycle step has one responsibility. */
export class DemoRecovery {
  private readonly state:RecoveryState={phase:DemoRecoveryPhase.Request,expires:0};
  private readonly issuance=new RecoveryRequestStep();
  private readonly inspection=new RecoveryInspectionStep();
  private readonly completion=new RecoveryCompletionStep();
  constructor(private readonly now:()=>number=Date.now){}
  request():DemoRecoveryPhase{return this.issuance.apply(this.state,this.now());}
  inspect():DemoRecoveryPhase{return this.inspection.apply(this.state,this.now());}
  consume():DemoRecoveryPhase{const phase=this.inspect();return phase===DemoRecoveryPhase.Ready?this.completion.apply(this.state):phase;}
  expire():DemoRecoveryPhase{this.state.expires=0;return this.inspect();}
}

export function validateDemoIdentity(email: string, firstName: string, lastName: string, phone = ''): string {
  if (!firstName.trim() || firstName.length>80) return 'Nombre: ingresá entre 1 y 80 caracteres.';
  if (!lastName.trim() || lastName.length>80) return 'Apellido: ingresá entre 1 y 80 caracteres.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length>254) return 'Email: ingresá una dirección válida.';
  if (phone && !/^[+\d ()-]{6,30}$/.test(phone)) return 'Teléfono: usá entre 6 y 30 dígitos y separadores.';
  return '';
}
