import { manifestLooksUnsafe } from '../../domain/user/profile-manifest';
import { ProfileDiffOperation, ProfileCompatibility } from '../../domain/user/profile-import';
export { ProfileDiffOperation, ProfileCompatibility };
export class ProfileCurrency {
  private constructor(readonly wire:string,readonly label:string){}
  static readonly Ars=new ProfileCurrency('ARS','ARS');
  static readonly Unknown=new ProfileCurrency('','Moneda desconocida');
  static fromWire(raw:unknown):ProfileCurrency{return raw===this.Ars||raw===this.Ars.wire?this.Ars:this.Unknown;}
  toJSON():string{return this.wire;}
}
export class ProfileTimeZone {
  private constructor(readonly wire:string,readonly label:string){}
  static readonly BuenosAires=new ProfileTimeZone('America/Argentina/Buenos_Aires','America/Argentina/Buenos_Aires');
  static readonly Unknown=new ProfileTimeZone('','Zona horaria desconocida');
  static fromWire(raw:unknown):ProfileTimeZone{return raw===this.BuenosAires||raw===this.BuenosAires.wire?this.BuenosAires:this.Unknown;}
  toJSON():string{return this.wire;}
}
export interface StoreProfile { storeName:string; supportEmail:string; supportPhone:string; currency:ProfileCurrency; timezone:ProfileTimeZone; }
export interface ProfileSection { sectionKey:string; content:Record<string,unknown>; active:boolean; sortOrder:number; }
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export class StoreProfileCodec {
  static baseline():StoreProfile{return{storeName:'Heragon Herramientas',supportEmail:'soporte@demo.invalid',supportPhone:'+54 11 0000 2209',currency:ProfileCurrency.Ars,timezone:ProfileTimeZone.BuenosAires};}
  static reset():StoreProfile{return{...this.baseline(),storeName:'Mi tienda',supportEmail:'',supportPhone:''};}
  static fromWire(raw:unknown):StoreProfile{
    if(!record(raw)||!exact(raw,['storeName','supportEmail','supportPhone','currency','timezone'])||typeof raw['storeName']!=='string'||!raw['storeName'].trim()||raw['storeName'].length>160||typeof raw['supportEmail']!=='string'||(raw['supportEmail']!==''&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw['supportEmail']))||typeof raw['supportPhone']!=='string'||(raw['supportPhone']!==''&&(!/^\+?[0-9 ()-]{6,40}$/.test(raw['supportPhone'])||!/[0-9]/.test(raw['supportPhone'])))||ProfileCurrency.fromWire(raw['currency'])!==ProfileCurrency.Ars||ProfileTimeZone.fromWire(raw['timezone'])!==ProfileTimeZone.BuenosAires)throw Error('Revisá nombre, email y teléfono. Moneda y zona son fijas.');
    return{storeName:raw['storeName'],supportEmail:raw['supportEmail'],supportPhone:raw['supportPhone'],currency:ProfileCurrency.Ars,timezone:ProfileTimeZone.BuenosAires};
  }
  static export(profile:StoreProfile):string{return JSON.stringify(this.fromWire(profile),null,2);}
}
const jsonValue=(v:unknown):boolean=>v===null||typeof v==='string'||typeof v==='boolean'||(typeof v==='number'&&Number.isFinite(v)&&(!Number.isInteger(v)||Number.isSafeInteger(v)))||(Array.isArray(v)&&v.every(jsonValue))||(record(v)&&Object.values(v).every(jsonValue));
export class ProfileSectionsCodec {
  static fromWire(raw:unknown):ProfileSection[]{return this.decode(raw,100);}
  static fromStoredWire(raw:unknown):ProfileSection[]{return this.decode(raw,Number.MAX_SAFE_INTEGER);}
  private static decode(raw:unknown,maximum:number):ProfileSection[]{
    if(!Array.isArray(raw)||raw.length>maximum)throw Error('Se admiten hasta 100 secciones.');
    const seen=new Set<string>();
    return raw.map((r:unknown)=>{
      if(!record(r)||!exact(r,['sectionKey','content','active','sortOrder'])||typeof r['sectionKey']!=='string'||!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(r['sectionKey'])||seen.has(r['sectionKey'])||!record(r['content'])||!jsonValue(r['content'])||new TextEncoder().encode(JSON.stringify(r['content'])).length>20000||manifestLooksUnsafe(JSON.stringify(r['content']))||typeof r['active']!=='boolean'||!Number.isSafeInteger(r['sortOrder'])||Number(r['sortOrder'])<0||Number(r['sortOrder'])>2147483647)throw Error('Sección inválida: clave única, contenido objeto hasta 20.000 bytes, active booleano y sortOrder entero.');
      seen.add(r['sectionKey']);return{sectionKey:r['sectionKey'],content:JSON.parse(JSON.stringify(r['content'])) as Record<string,unknown>,active:r['active'],sortOrder:Number(r['sortOrder'])};
    });
  }
}
export interface DemoProfileManifest { sections:ProfileSection[]; selection:string[]; compatibility:ProfileCompatibility; }
export class ParseDemoProfileStep {
  execute(text:string,allowEmpty=false):DemoProfileManifest{
    if(manifestLooksUnsafe(text))throw Error('Se detectó un posible secreto o credencial. El manifiesto completo fue rechazado.');
    let r:unknown;try{r=JSON.parse(text);}catch{throw Error('El manifiesto debe ser JSON válido.');}
    if(!record(r)||!exact(r,['profile_name','profile_version','coreCompatibility','content','mergeSelection'])||typeof r['profile_name']!=='string'||typeof r['profile_version']!=='string'||typeof r['coreCompatibility']!=='string'||!record(r['content'])||!exact(r['content'],['homeSections'])||!record(r['mergeSelection'])||!exact(r['mergeSelection'],['homeSections']))throw Error('El esquema del manifiesto no es válido.');
    const sections=ProfileSectionsCodec.fromWire(r['content']['homeSections']),selection=r['mergeSelection']['homeSections'];
    if(!Array.isArray(selection)||(!allowEmpty&&!selection.length)||selection.some(k=>typeof k!=='string'||!sections.some(s=>s.sectionKey===k))||new Set(selection).size!==selection.length)throw Error('Elegí una selección existente, única y no vacía.');
    return{sections,selection:selection as string[],compatibility:ProfileCompatibility.fromWire(r['profile_name']==='universal-tools-profile'&&r['profile_version']==='1.0.0'&&r['coreCompatibility']==='1.x')};
  }
}
const canonical=(value:unknown):string=>JSON.stringify(sort(value));
function sort(value:unknown):unknown{return Array.isArray(value)?value.map(sort):record(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])])):value;}
export interface DemoProfileChange { sectionKey:string; operation:ProfileDiffOperation; before:ProfileSection|undefined; after:ProfileSection; }
export class PreviewDemoProfileStep {
  execute(current:ProfileSection[],incoming:ProfileSection[]):DemoProfileChange[]{return incoming.map(after=>{const before=current.find(s=>s.sectionKey===after.sectionKey);return{sectionKey:after.sectionKey,before,after,operation:!before?ProfileDiffOperation.Add:canonical(before)===canonical(after)?ProfileDiffOperation.Unchanged:ProfileDiffOperation.Update};});}
}
export class MergeDemoProfileStep {
  execute(current:ProfileSection[],manifest:DemoProfileManifest):ProfileSection[]{
    if(manifest.compatibility!==ProfileCompatibility.Compatible||!manifest.selection.length||new Set(manifest.selection).size!==manifest.selection.length||manifest.selection.some(k=>!manifest.sections.some(s=>s.sectionKey===k)))throw Error('La selección no es aplicable.');
    const selected=manifest.sections.filter(s=>manifest.selection.includes(s.sectionKey));
    const result=current.map(before=>{const after=selected.find(s=>s.sectionKey===before.sectionKey);return after&&canonical(after)!==canonical(before)?after:before;});
    return ProfileSectionsCodec.fromStoredWire([...result,...selected.filter(s=>!current.some(c=>c.sectionKey===s.sectionKey))]);
  }
}
export class ProfileCommandResult {
  private constructor(readonly wire:string,readonly label:string){}
  static readonly Saved=new ProfileCommandResult('SAVED','Cambio guardado localmente.');
  static readonly Failed=new ProfileCommandResult('FAILED','No se guardó. Usá Releer estado local antes de volver a confirmar.');
  static readonly Conflict=new ProfileCommandResult('CONFLICT','Los datos cambiaron. Releé el estado y volvé a previsualizar y confirmar.');
  static readonly Uncertain=new ProfileCommandResult('UNCERTAIN','Resultado incierto. Releé el estado y volvé a previsualizar y confirmar; no se reintentará automáticamente.');
  static readonly Denied=new ProfileCommandResult('DENIED','Acceso denegado.');
  static readonly Unknown=new ProfileCommandResult('UNKNOWN','Resultado no reconocido.');
  static fromWire(raw:unknown):ProfileCommandResult{return[this.Saved,this.Failed,this.Conflict,this.Uncertain,this.Denied].find(v=>v.wire===raw)??this.Unknown;}
}
export class ProfileDialog {
  private constructor(readonly label:string){}
  static readonly None=new ProfileDialog('');static readonly Export=new ProfileDialog('Exportar configuración parcial');static readonly Reset=new ProfileDialog('Restablecer configuración');static readonly Merge=new ProfileDialog('Confirmar importación local');static readonly Preview=new ProfileDialog('Vista previa de importación');static readonly Unknown=new ProfileDialog('Diálogo desconocido');
}
export const DEMO_PROFILE_EXAMPLE=JSON.stringify({profile_name:'universal-tools-profile',profile_version:'1.0.0',coreCompatibility:'1.x',content:{homeSections:[{sectionKey:'welcome',content:{heading:'Bienvenido al comercio de muestra'},active:true,sortOrder:0}]},mergeSelection:{homeSections:['welcome']}},null,2);

export class ProfileAuthorityRevoked extends Error {}
export class ProfileSettingField {
  private constructor(readonly key:'storeName'|'supportEmail'|'supportPhone',readonly label:string){}
  static readonly Name=new ProfileSettingField('storeName','Nombre del comercio');
  static readonly Email=new ProfileSettingField('supportEmail','Email de soporte');
  static readonly Phone=new ProfileSettingField('supportPhone','Teléfono de soporte');
  static readonly values=[this.Name,this.Email,this.Phone];
}
