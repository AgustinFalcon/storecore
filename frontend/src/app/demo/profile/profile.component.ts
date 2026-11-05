import { Component, HostListener, DestroyRef, ElementRef, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DemoApplicationState } from '../demo-state';
import { trapDemoDialogFocus } from '../demo-dialog-focus';
import { PreviewValidity, ProfileImportPhase } from '../../domain/user/profile-import';
import { StoreProfileCodec, ProfileAuthorityRevoked, ProfileSettingField, ProfileDiffOperation, ParseDemoProfileStep, PreviewDemoProfileStep, ProfileCompatibility, ProfileCommandResult, ProfileDialog, DEMO_PROFILE_EXAMPLE, type DemoProfileChange, type DemoProfileManifest } from './profile-domain';
import {ProfileRouteDraftCodec} from './profile-route-draft';

@Component({selector:'sc-demo-profile',imports:[FormsModule],templateUrl:'./profile.component.html',styleUrls:['../demo.scss','./profile.component.scss']})
export class DemoProfileComponent {
  readonly state=inject(DemoApplicationState);
  private readonly host=inject<ElementRef<HTMLElement>>(ElementRef);
  readonly modal=viewChild<ElementRef<HTMLDialogElement>>('modal');
  readonly Dialog=ProfileDialog;readonly Phase=ProfileImportPhase;readonly Validity=PreviewValidity;
  readonly dialog=signal(ProfileDialog.None);readonly phase=signal(ProfileImportPhase.AccessDenied);readonly validity=signal(PreviewValidity.Missing);
  readonly trapFocus=trapDemoDialogFocus;
  draft=StoreProfileCodec.reset();resetBefore=StoreProfileCodec.reset();resetProfile=StoreProfileCodec.reset();exportText='';manifest='';error='';status='';changes:DemoProfileChange[]=[];selection:string[]=[];
  configError='';configStatus='';conflicts:ProfileSettingField[]=[];
  private baseline=StoreProfileCodec.reset();private readonly revoked=signal(false);
  private owner='';
  private routeDraftOwner='';
  private snapshot:ReturnType<DemoApplicationState['readProfile']>|null=null;
  private reviewed:DemoProfileManifest|null=null;private previewText='';private busy=false;private alive=true;private trigger:HTMLElement|null=null;
  private dialogReview:{authority:string;raw:string|null;revision:number}|null=null;
  private static readonly routeDraftKey='storecore.demo.profile-route-draft';
  get authorized():boolean{return !this.revoked()&&this.state.canConfigureProfile;}
  get configDirty():boolean{return JSON.stringify(this.draft)!==JSON.stringify(this.baseline);}
  get canSave():boolean{return this.canPersist&&this.configDirty&&this.conflicts.length===0;}
  get canMerge():boolean{
    if(!this.canPersist||!this.snapshot||this.validity()!==PreviewValidity.Valid||this.previewText!==this.manifest||!this.reviewed?.selection.length||!this.changes.some(c=>this.selection.includes(c.sectionKey)&&c.operation!==ProfileDiffOperation.Unchanged&&c.operation.selectable))return false;
    try{const current=this.state.readProfile();return this.sameSnapshot(current,this.snapshot);}catch{return false;}
  }
  get reviewNeedsAttention():boolean{
    if(!this.changes.length||this.validity()!==PreviewValidity.Valid)return false;
    if(!this.snapshot||!this.reviewed?.selection.some(key=>this.changes.some(c=>c.sectionKey===key&&c.operation!==ProfileDiffOperation.Unchanged&&c.operation.selectable)))return true;
    try{return !this.sameSnapshot(this.state.readProfile(),this.snapshot);}catch{return true;}
  }
  get canPersist():boolean{return this.canWrite&&this.state.writerStatus().writable;}
  get canWrite():boolean{return this.authorized&&!this.busy&&this.phase()!==ProfileImportPhase.ResultUncertain&&this.snapshot!==null;}
  readonly json=(v:unknown)=>v===undefined?'No existe':JSON.stringify(v,null,2);
  constructor(){
    effect(()=>{this.state.context();this.state.role();this.state.actorId();this.state.sessionEpoch();this.state.sessionGeneration();untracked(()=>{this.revoked.set(false);if(this.refresh(true))this.restoreRouteDraft();});});
    inject(DestroyRef).onDestroy(()=>{this.persistRouteDraft();this.alive=false;this.clear();});
  }
  private persistRouteDraft():void{
    const authority=this.routeDraftOwner;if(!authority||authority!==this.routeDraftAuthority())return;
    try{if(!this.authorized||(!this.configDirty&&!this.manifest.trim())){sessionStorage.removeItem(DemoProfileComponent.routeDraftKey);return;}sessionStorage.setItem(DemoProfileComponent.routeDraftKey,ProfileRouteDraftCodec.encode(authority,this.baseline,this.draft,this.manifest));}catch{/* beforeunload still warns; navigation never fails because browser storage is unavailable. */}
  }
  private restoreRouteDraft():void{
    let raw:string|null=null;try{raw=sessionStorage.getItem(DemoProfileComponent.routeDraftKey);}catch{return;}const saved=ProfileRouteDraftCodec.decode(raw);if(!saved||!this.authorized||saved.authority!==this.routeDraftAuthority()){try{sessionStorage.removeItem(DemoProfileComponent.routeDraftKey);}catch{/* A blocked storage cleanup must not block navigation. */}return;}
    const rebased={...this.baseline};const conflicts:ProfileSettingField[]=[];
    for(const field of ProfileSettingField.values){if(saved.draft[field.key]===saved.baseline[field.key])continue;rebased[field.key]=saved.draft[field.key];if(this.baseline[field.key]!==saved.baseline[field.key]&&this.baseline[field.key]!==saved.draft[field.key])conflicts.push(field);}
    this.draft=rebased;this.conflicts=conflicts;this.manifest=saved.manifest;this.phase.set(ProfileImportPhase.Editing);this.configStatus=conflicts.length?'Recuperamos la propuesta con cambios concurrentes. Elegí qué versión conservar.':'Recuperamos los cambios pendientes de esta sesión.';this.status=this.manifest?'Recuperamos el manifiesto pendiente. Previsualizalo antes de aplicarlo.':'';
  }
  private routeDraftAuthority():string{return JSON.stringify([this.state.actorId(),this.state.sessionGeneration()]);}
  @HostListener('window:beforeunload',['$event']) beforeUnload(event:BeforeUnloadEvent):void{if(this.authorized&&(this.configDirty||!!this.manifest.trim())){event.preventDefault();event.returnValue='';this.persistRouteDraft();}}
  private clear():void{this.close(false);this.snapshot=null;this.owner='';this.routeDraftOwner='';this.reviewed=null;this.previewText='';this.manifest='';this.changes=[];this.selection=[];this.exportText='';this.draft=StoreProfileCodec.reset();this.baseline=StoreProfileCodec.reset();this.resetBefore=StoreProfileCodec.reset();this.configError='';this.configStatus='';this.conflicts=[];this.error='';this.status='';this.validity.set(PreviewValidity.Missing);this.phase.set(ProfileImportPhase.AccessDenied);}
  refresh(clear=false):boolean{
    const priorAuthority=this.owner,recovering=this.snapshot===null&&!!this.owner;
    if(!this.authorized){this.clear();this.focusHeading();return false;}
    try{
      const loaded=this.state.readProfile(),routeAuthority=this.routeDraftAuthority(),initial=clear||priorAuthority!==loaded.authority;
      const hadDialog=this.dialog()!==ProfileDialog.None;this.close(false);if(hadDialog)this.focusHeading();if(initial)this.clear();
      const rebased={...loaded.profile};
      if(!initial){
        const conflicts=this.conflicts.filter(field=>this.draft[field.key]!==loaded.profile[field.key]);
        for(const field of ProfileSettingField.values){
          if(this.draft[field.key]===this.baseline[field.key])continue;
          rebased[field.key]=this.draft[field.key];
          if(loaded.profile[field.key]!==this.baseline[field.key]&&loaded.profile[field.key]!==this.draft[field.key]&&!conflicts.includes(field))conflicts.push(field);
        }
        this.conflicts=conflicts;
      }
      this.draft=rebased;this.baseline={...loaded.profile};this.snapshot=loaded;this.owner=loaded.authority;this.routeDraftOwner=routeAuthority;
      this.reviewed=null;this.previewText='';this.changes=[];this.selection=[];this.validity.set(PreviewValidity.Missing);this.phase.set(ProfileImportPhase.Editing);
      this.error='';this.configError='';if(recovering){this.configStatus='Estado local recuperado. Revisá la propuesta y volvé a confirmar.';this.status=this.manifest?'Estado local recuperado. Volvé a previsualizar y confirmar.':'';}return true;
    }catch(error){
      if(error instanceof ProfileAuthorityRevoked){this.revoked.set(true);this.clear();this.focusHeading();return false;}
      if(!this.authorized||priorAuthority!==this.state.profileAuthority()){this.clear();this.focusHeading();}
      else{this.snapshot=null;this.reviewed=null;this.previewText='';this.changes=[];this.selection=[];this.validity.set(PreviewValidity.Stale);this.phase.set(ProfileImportPhase.Failed);}
      this.configError='No se pudo releer el estado local. Conservamos la propuesta. Usá Releer estado local.';this.configStatus='';return false;
    }
  }
  @HostListener('window:storage',['$event']) storageChanged(event:StorageEvent):void{if(event.key==='storecore.commercial-demo.v1')this.refresh();}
  acceptRemote():void{if(!this.authorized)return;for(const field of this.conflicts)this.draft[field.key]=this.baseline[field.key];this.conflicts=[];}
  keepDraft():void{if(this.authorized)this.conflicts=[];}
  edit(clearDiff=true):void{if(!this.authorized)return;this.reviewed=null;this.previewText='';if(clearDiff){this.changes=[];this.selection=[];}this.validity.set(PreviewValidity.Stale);this.phase.set(ProfileImportPhase.Editing);this.error='';this.status='';}
  select(key:string,checked:boolean):void{
    if(!this.authorized)return;
    this.selection=checked?[...new Set([...this.selection,key])]:this.selection.filter(k=>k!==key);
    try{const root=JSON.parse(this.manifest) as Record<string,unknown>;root['mergeSelection']={homeSections:[...this.selection]};this.manifest=JSON.stringify(root,null,2);}catch{ /* Invalid source stays visible for correction. */ }
    this.edit(false);
  }
  preview():void{
    if(!this.canWrite)return;
    this.edit();this.phase.set(ProfileImportPhase.Previewing);
    try{
      const parsed=new ParseDemoProfileStep().execute(this.manifest,true);
      this.changes=new PreviewDemoProfileStep().execute(this.snapshot!.sections,parsed.sections);this.selection=[...parsed.selection];
      if(parsed.compatibility!==ProfileCompatibility.Compatible){this.validity.set(PreviewValidity.Incompatible);this.phase.set(ProfileImportPhase.Failed);return;}
      this.reviewed=parsed;this.previewText=this.manifest;this.validity.set(PreviewValidity.Valid);this.phase.set(ProfileImportPhase.Reviewing);this.open(ProfileDialog.Preview);
    }catch(error){this.changes=[];this.selection=[];this.validity.set(PreviewValidity.Missing);this.phase.set(ProfileImportPhase.Failed);this.error=error instanceof Error?error.message:'Manifiesto inválido.';}
  }
  open(dialog:ProfileDialog):void{
    if(!this.canWrite||this.dialog()!==ProfileDialog.None)return;
    if(dialog===ProfileDialog.Merge&&!this.canMerge)return;
    if(dialog===ProfileDialog.Reset&&!this.canPersist)return;
    try{
      const current=this.state.readProfile();
      if(dialog===ProfileDialog.Export){this.exportText=StoreProfileCodec.export(current.profile);this.dialogReview={authority:current.authority,raw:current.raw,revision:current.revision};}
      else if(current.raw!==this.snapshot!.raw){this.configError='Los datos cambiaron. Usá Releer estado local antes de continuar.';this.snapshot=null;return;}
    }catch(error){if(error instanceof ProfileAuthorityRevoked){this.revoked.set(true);this.clear();this.focusHeading();}else this.configError='No se pudo leer la configuración persistida. Usá Releer estado local.';return;}
    if(dialog===ProfileDialog.Reset)this.resetBefore={...this.snapshot!.profile};
    if(dialog!==ProfileDialog.Export)this.dialogReview={authority:this.snapshot!.authority,raw:this.snapshot!.raw,revision:this.snapshot!.revision};
    this.trigger=document.activeElement instanceof HTMLElement?document.activeElement:null;this.dialog.set(dialog);
    setTimeout(()=>{if(this.alive&&this.dialog()===dialog){this.modal()?.nativeElement.showModal();this.modal()?.nativeElement.querySelector<HTMLElement>('#profile-dialog-heading')?.focus();}},0);
  }
  close(restore=true):void{this.modal()?.nativeElement.close();this.dialog.set(ProfileDialog.None);this.dialogReview=null;if(restore&&this.trigger?.isConnected)this.trigger.focus();}
  example():void{if(!this.canWrite)return;this.manifest=DEMO_PROFILE_EXAMPLE;this.edit();this.changes=[];this.selection=[];this.close();setTimeout(()=>{if(this.alive&&this.authorized)this.host.nativeElement.querySelector<HTMLElement>('#profile-manifest')?.focus();},0);}
  async save():Promise<void>{
    if(!this.canSave)return;
    try{const profile=StoreProfileCodec.fromWire(this.draft);await this.write(profile,null);}catch(error){this.configError=error instanceof Error?error.message:'Configuración inválida.';this.configStatus='';}
  }
  async reset():Promise<void>{if(this.dialog()!==ProfileDialog.Reset||!this.canPersist||!this.validateDialog())return;this.close();await this.write(StoreProfileCodec.reset(),null);}
  async merge():Promise<void>{if(this.dialog()!==ProfileDialog.Merge||!this.validateDialog()||!this.canMerge)return;const reviewed=this.reviewed!;this.close();await this.write(null,reviewed);}
  private async write(profile:Parameters<DemoApplicationState['writeProfile']>[1],manifest:Parameters<DemoApplicationState['writeProfile']>[2]):Promise<void>{
    if(!this.snapshot||this.busy)return;const expected=this.snapshot,isImport=manifest!==null;
    this.busy=true;if(isImport){this.phase.set(ProfileImportPhase.Merging);this.error='';this.status='';}else{this.configError='';this.configStatus='Guardando configuración…';}
    await Promise.resolve();
    if(!this.alive||!this.authorized||expected.authority!==this.state.profileAuthority()){this.busy=false;this.clear();this.focusHeading();return;}
    const result=this.state.writeProfile(expected,profile,manifest);this.busy=false;
    if(result===ProfileCommandResult.Denied){this.revoked.set(true);this.clear();this.focusHeading();return;}
    this.reviewed=null;this.previewText='';this.validity.set(PreviewValidity.Stale);
    if(result===ProfileCommandResult.Saved){
      // Rebase import against the current config proposal; only a settings write consumes it.
      if(!isImport&&profile){this.draft={...profile};this.baseline={...profile};this.conflicts=[];}
      if(!this.refresh()){this.status='';this.configStatus='';if(!isImport)this.phase.set(ProfileImportPhase.Editing);this.focusHeading();return;}
      if(isImport){this.manifest='';sessionStorage.removeItem(DemoProfileComponent.routeDraftKey);this.status=result.label;this.phase.set(ProfileImportPhase.Succeeded);this.focusHeading();}
      else{this.configStatus=result.label;this.focusHeading();}
    }else{
      this.snapshot=null;this.phase.set(isImport?(result===ProfileCommandResult.Uncertain?ProfileImportPhase.ResultUncertain:ProfileImportPhase.Failed):ProfileImportPhase.Editing);
      if(isImport)this.status=result.label;else this.configStatus=result.label;this.focusHeading();
    }
  }
  private focusRequest=0;
  private focusHeading():void{const request=++this.focusRequest;setTimeout(()=>{if(this.alive&&request===this.focusRequest)(this.host.nativeElement.querySelector<HTMLElement>('#configuration-heading')??this.host.nativeElement.querySelector<HTMLElement>('#configuration-denied-heading'))?.focus();},0);}
  private sameSnapshot(left:{authority:string;raw:string|null;revision:number},right:{authority:string;raw:string|null;revision:number}):boolean{return left.authority===right.authority&&left.raw===right.raw&&left.revision===right.revision;}
  private validateDialog():boolean{
    if(!this.authorized||!this.dialogReview){if(!this.authorized){this.clear();this.focusHeading();}return false;}
    try{
      const current=this.state.readProfile();
      if(!this.sameSnapshot(current,this.dialogReview)||(this.dialog()===ProfileDialog.Export&&StoreProfileCodec.export(current.profile)!==this.exportText)){
        this.close();this.refresh();this.configStatus='Los datos cambiaron. Revisá nuevamente el alcance antes de confirmar.';this.focusHeading();return false;
      }
      return true;
    }catch(error){
      if(error instanceof ProfileAuthorityRevoked){this.revoked.set(true);this.clear();}
      else{this.close();this.snapshot=null;this.reviewed=null;this.previewText='';this.validity.set(PreviewValidity.Stale);this.configError='No se pudo verificar el estado revisado. Usá Releer estado local.';}
      this.focusHeading();return false;
    }
  }
  download():void{
    if(this.dialog()!==ProfileDialog.Export||!this.validateDialog())return;
    const blob=new Blob([this.exportText],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='comercio-demo.json';a.click();URL.revokeObjectURL(url);this.close();
  }
}
