import {Component,DestroyRef,Input,OnChanges,inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {DemoPasswordFlow,PasswordDemoField,PasswordDemoPhase} from './password-demo';
@Component({selector:'sc-demo-password',imports:[FormsModule],template:
`<section class="card" aria-labelledby="password-demo-heading"><h2 id="password-demo-heading">Cambiar contraseña · simulación</h2><p id="password-demo-disclosure">Demo no puede verificar tu contraseña actual. Usá valores de muestra: no se guardan claves ni se modifican login, sesiones o recuperación.</p><form novalidate (submit)="$event.preventDefault();review()" aria-describedby="password-demo-disclosure">
@for(field of fields;track field.id){<label [for]="'password-'+field.id">{{field.label}}</label><input [id]="'password-'+field.id" [name]="field.id" type="password" autocomplete="off" [ngModel]="flow.values.get(field)??''" (ngModelChange)="change(field,$event)" [disabled]="flow.phase===Phase.Confirming" [attr.aria-invalid]="flow.errors.has(field)" [attr.aria-describedby]="flow.errors.has(field)?'password-error-'+field.id:null"/>@if(flow.errors.get(field);as error){<p [id]="'password-error-'+field.id" role="alert">{{error}}</p>}}
<p role="status">{{flow.phase.label}}</p>@if(flow.phase===Phase.Confirming){<p>Confirmar sólo valida formato y coincidencia. No autentica la contraseña actual.</p><button data-cta="password-confirm" type="button" (click)="flow.confirm()">Confirmar simulación</button>}@else{<button data-cta="password-review" type="submit">Revisar cambio simulado</button>}<button data-cta="password-cancel" type="button" (click)="flow.clear()">Cancelar y borrar valores</button></form></section>`,styles:[`:host{display:block;margin-top:1.5rem}section{padding:1.25rem;border:1px solid #ccd4df;border-radius:12px}form{display:grid;gap:.6rem;max-width:36rem}input,button{padding:.75rem;min-height:44px;font:inherit}input[aria-invalid="true"]{border:2px solid #a32222}p[role="alert"]{color:#a32222}`]})
export class DemoPasswordComponent implements OnChanges {
 @Input() epoch=0;readonly flow=new DemoPasswordFlow();readonly fields=PasswordDemoField.all;readonly Phase=PasswordDemoPhase;
 constructor(){inject(DestroyRef).onDestroy(()=>this.flow.clear());}
 ngOnChanges():void{this.flow.clear();}
 change(field:PasswordDemoField,value:string):void{this.flow.values.set(field,value);this.flow.errors.delete(field);this.flow.phase=PasswordDemoPhase.Editing;}
 review():void{if(!this.flow.review()){const first=this.fields.find(field=>this.flow.errors.has(field));if(first)document.getElementById('password-'+first.id)?.focus();}}
}
