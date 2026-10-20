import { DemoContext, DemoSnapshot } from './demo-model';
import { DemoScreen } from './demo-screen';
import { DemoRole } from './demo-roles';

/** Navigation intent is deliberately narrower than an arbitrary return URL. */
export class DemoAccessIntent {
  private constructor(readonly path: string, readonly screen: DemoScreen, private readonly orderId?: string) {}
  static readonly Unknown = new DemoAccessIntent('', DemoScreen.Unknown);
  static fromWire(raw: unknown): DemoAccessIntent {
    if (typeof raw !== 'string' || (raw !== '/demo' && !raw.startsWith('/demo/'))) return this.Unknown;
    const segments = raw === '/demo' ? [] : raw.slice(6).split('/');
    for (const screen of DemoScreen.all) {
      if (screen === DemoScreen.Login || screen === DemoScreen.Register) continue;
      const pattern = screen.path ? screen.path.split('/') : [];
      if (segments.length !== pattern.length || !pattern.every((part, index) => part.startsWith(':') ? /^[A-Za-z0-9:_-]{1,128}$/.test(segments[index]) : part === segments[index])) continue;
      const orderPosition = pattern.findIndex(part => part === ':id' || part === ':orderId');
      return new DemoAccessIntent(raw, screen, orderPosition < 0 ? undefined : segments[orderPosition]);
    }
    return this.Unknown;
  }
  destination(snapshot: DemoSnapshot, actor: string, context: DemoContext): string {
    const home = context === DemoContext.Admin ? '/demo/user/home' : '/demo';
    const identity = snapshot.actors.find(value => value.id === actor);
    const authorized = !!identity && ((context === DemoContext.Admin && identity.role === DemoRole.Admin) || (context === DemoContext.Customer && identity.role === DemoRole.Customer));
    if (this === DemoAccessIntent.Unknown || !authorized) return home;
    if (this.screen.admin && context !== DemoContext.Admin) return home;
    if (this.screen.privateCustomer && context !== DemoContext.Customer) return home;
    if (this.orderId && !snapshot.orders.some(order => order.id === this.orderId && (this.screen.admin || order.actor === actor))) return home;
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
