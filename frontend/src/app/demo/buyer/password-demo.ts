export class PasswordDemoPhase {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly Editing=new PasswordDemoPhase('editing','Completá los tres campos.');
 static readonly Invalid=new PasswordDemoPhase('invalid','Revisá los campos indicados.');
 static readonly Confirming=new PasswordDemoPhase('confirming','Confirmá la simulación.');
 static readonly Success=new PasswordDemoPhase('success','Cambio simulado completado. No se guardó ninguna contraseña ni cambió tu acceso.');
 static readonly Unknown=new PasswordDemoPhase('unknown','Estado no reconocido.');
 static readonly all=[this.Editing,this.Invalid,this.Confirming,this.Success];
 static fromWire(raw:unknown):PasswordDemoPhase{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class PasswordDemoField {
 private constructor(readonly id:string,readonly label:string,readonly autocomplete:string){}
 static readonly Current=new PasswordDemoField('current','Contraseña actual','current-password');
 static readonly New=new PasswordDemoField('new','Nueva contraseña','new-password');
 static readonly Confirmation=new PasswordDemoField('confirmation','Confirmar nueva contraseña','new-password');
 static readonly Unknown=new PasswordDemoField('unknown','Campo desconocido','off');
 static readonly all=[this.Current,this.New,this.Confirmation];
 static fromWire(raw:unknown):PasswordDemoField{return this.all.find(value=>value.id===raw)??this.Unknown;}
}
/** Values live only in this object; no persistence or identity dependencies. */
export class DemoPasswordFlow {
 phase=PasswordDemoPhase.Editing;
 readonly values=new Map<PasswordDemoField,string>();
 readonly errors=new Map<PasswordDemoField,string>();
 review():boolean {
  this.errors.clear();
  for(const field of PasswordDemoField.all) if((this.values.get(field)??'').length<4)this.errors.set(field,field.label+': ingresá al menos 4 caracteres de muestra.');
  if(this.values.get(PasswordDemoField.New)!==this.values.get(PasswordDemoField.Confirmation))this.errors.set(PasswordDemoField.Confirmation,'La confirmación debe coincidir con la nueva contraseña de muestra.');
  this.phase=this.errors.size?PasswordDemoPhase.Invalid:PasswordDemoPhase.Confirming;return !this.errors.size;
 }
 confirm():void {if(this.phase!==PasswordDemoPhase.Confirming)return;this.clear();this.phase=PasswordDemoPhase.Success;}
 clear():void {this.values.clear();this.errors.clear();this.phase=PasswordDemoPhase.Editing;}
}
