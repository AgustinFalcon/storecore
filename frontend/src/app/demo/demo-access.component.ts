import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DemoApplicationState } from './demo-state';
import { DemoContext } from './demo-model';
import { DemoRecovery, DemoRecoveryPhase, validateDemoIdentity } from './demo-access';

@Component({ selector:'sc-demo-access', imports:[FormsModule,RouterLink], styleUrl:'./demo.scss', template: `
<div class="auth-layout"><div class="auth-art"><p class="eyebrow">TU TIENDA · DEMOSTRACIÓN</p><h2>Una entrada, dos experiencias.</h2><p>Elegí un perfil de muestra para comprar o administrar. Cada comprador conserva su propio carrito, direcciones y pedidos.</p><p>Los datos y el código de acceso son de demostración. No ingreses contraseñas reales.</p></div>
<section class="card auth-card">
@if (recovering()) {
  <h2>Recuperar acceso de muestra</h2><p class="demo-note">Simulación local: no enviamos correo ni cambiamos credenciales.</p>
  <p role="status">{{phase().label}}</p>
  @if(error()){<p role="alert" tabindex="-1" id="access-error">{{error()}}</p>}
  @if (phase() === Phase.Request) { <form (submit)="$event.preventDefault(); requestRecovery()"><label>Email de muestra<input name="recoveryEmail" type="email" required [(ngModel)]="email"/></label><button data-cta="recovery-request" class="primary">Solicitar enlace de muestra</button></form> }
  @if (phase() === Phase.Sent) { <p>Si existe un perfil de muestra, podrás continuar desde su enlace. Esta confirmación es igual para cualquier email.</p><button data-cta="recovery-open" (click)="inspectRecovery()">Abrir enlace simulado</button><button data-cta="recovery-expire" (click)="phase.set(recovery.expire())">Simular vencimiento</button> }
  @if (phase() === Phase.Ready) { <p>Vence en cinco minutos y admite un solo uso.</p><button data-cta="recovery-complete" class="primary" (click)="phase.set(recovery.consume())">Completar recuperación simulada</button> }
  @if (phase() === Phase.Completed) { <p>Volvé a elegir tu perfil y usá el código de muestra <strong>demo</strong>.</p><button data-cta="recovery-reuse" (click)="inspectRecovery()">Probar enlace ya utilizado</button> }
  @if (phase() === Phase.Expired || phase() === Phase.Used || phase() === Phase.Unknown) { <p>Solicitá otro enlace para continuar.</p><button data-cta="recovery-again" (click)="phase.set(Phase.Request)">Nueva solicitud</button> }
  <button data-cta="recovery-login" (click)="recovering.set(false);phase.set(Phase.Request)">Volver a ingresar</button>
} @else {
  <h2>{{register() ? 'Crear perfil comprador de muestra' : 'Ingresar'}}</h2><p class="demo-note">Acceso de demostración con código público <strong>demo</strong>. Las sesiones reales se homologan por separado.</p>
  <form novalidate (submit)="$event.preventDefault(); submit()">
  @if (register()) { <label>Nombre<input name="firstName" [(ngModel)]="firstName" maxlength="80"/></label><label>Apellido<input name="lastName" [(ngModel)]="lastName" maxlength="80"/></label><label>Email<input name="email" type="email" [(ngModel)]="email" maxlength="254"/></label> }
  @else { <label>Perfil comprador de muestra<select name="sample" [(ngModel)]="email" (ngModelChange)="chooseContext=false">@for(actor of state.data.actors;track actor.id){<option [value]="actor.email">{{actor.firstName}} {{actor.lastName}} · {{actor.email}}</option>}</select></label> }
  <label>Contraseña<input name="password" [type]="showPassword?'text':'password'" [(ngModel)]="password" autocomplete="off" aria-describedby="demo-code"/></label><small id="demo-code">Usá solamente el código público demo.</small>
  <button data-cta="login-password-toggle" type="button" (click)="showPassword=!showPassword">{{showPassword?'Ocultar':'Mostrar'}} código</button>
  @if(error()){<p class="demo-note" role="alert" tabindex="-1" id="access-error">{{error()}}</p>}
  <button data-cta="login-submit" type="submit" class="primary">{{register()?'Crear perfil demo':'Continuar'}}</button>
  <a data-cta="login-register-link" [routerLink]="register()?'/demo/login':'/demo/customer/register'">{{register()?'Ya tengo un perfil':'Crear perfil comprador'}}</a>
  <button data-cta="login-recovery" type="button" (click)="recovering.set(true);phase.set(Phase.Request)">Recuperar acceso de muestra</button>
  @if(chooseContext){<div class="context-choice"><h3>Elegí tu experiencia</h3><button data-cta="login-customer" type="button" (click)="enter(Context.Customer)">Comprar como {{selectedName}} →</button><button data-cta="login-admin" type="button" (click)="enter(Context.Admin)">Administrador de muestra · gestionar comercio →</button><button data-cta="login-context-cancel" type="button" (click)="chooseContext=false">Cancelar</button></div>}
  </form>
}
</section></div>` })
export class DemoAccessComponent {
  readonly register=input(false); readonly state=inject(DemoApplicationState); private readonly router=inject(Router);
  readonly Context=DemoContext; readonly Phase=DemoRecoveryPhase; readonly recovery=new DemoRecovery(); readonly phase=signal(DemoRecoveryPhase.Request); readonly recovering=signal(false); readonly error=signal('');
  email='cliente@demo.invalid'; password=''; firstName=''; lastName=''; showPassword=false; chooseContext=false;
  get selectedName():string { return this.state.data.actors.find(actor=>actor.email===this.email)?.firstName ?? 'perfil de muestra'; }
  private fail(message:string):void { this.error.set(message); setTimeout(()=>document.getElementById('access-error')?.focus()); }
  submit():void {
    this.error.set(''); this.chooseContext=false;
    if(this.password!=='demo'){this.fail('Código de muestra incorrecto. Usá demo; no ingreses contraseñas reales.');return;}
    if(!this.register()){if(!this.state.data.actors.some(actor=>actor.email===this.email)){this.fail('Elegí un perfil de muestra disponible.');return;} this.chooseContext=true;return;}
    const email=this.email.trim().toLowerCase();const validation=validateDemoIdentity(email,this.firstName,this.lastName);if(validation){this.fail(validation);return;}
    if(this.state.data.actors.some(actor=>actor.email.trim().toLowerCase()===email)){this.fail('Email: ya existe un perfil comprador de muestra con esta dirección.');return;}
    const id=crypto.randomUUID();if(this.state.run(()=>{this.state.data.actors.push({id,email,firstName:this.firstName.trim(),lastName:this.lastName.trim(),phone:'',addresses:[],cart:[],favorites:[]});this.state.commerce.touch();},'Perfil de muestra creado.')){this.state.login(DemoContext.Customer,id);const destination=this.state.consumeIntent();void this.router.navigateByUrl(destination==='/demo'?'/demo/customer/profile':destination);}
  }
  enter(context:DemoContext):void { const actor=this.state.data.actors.find(value=>value.email===this.email);if(!this.chooseContext||this.password!=='demo'||!actor){this.fail('Volvé a elegir el perfil y confirmar el código de muestra.');return;}this.state.login(context,context===DemoContext.Admin?'cliente':actor.id);void this.router.navigateByUrl(this.state.consumeIntent()); }
  requestRecovery():void { if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())){this.fail('Email: ingresá una dirección válida.');return;}this.error.set('');this.phase.set(this.recovery.request()); }
  inspectRecovery():void {this.phase.set(this.recovery.inspect());}
}
