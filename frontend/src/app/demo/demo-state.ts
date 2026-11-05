import {StoreProfileCodec,ProfileSectionsCodec,ProfileAuthorityRevoked,MergeDemoProfileStep,ProfileCommandResult,type StoreProfile,type DemoProfileManifest} from './profile/profile-domain';
import {DemoProfileWriteFailure} from './demo-snapshot-persistence';
import { Injectable, signal } from '@angular/core';
import { DemoCommerce, DemoContext, DemoScenario, decodeSnapshot, demoSeed } from './demo-model';
import { DemoSnapshotPersistence } from './demo-snapshot-persistence';
import { DemoSnapshotWriter } from './demo-snapshot-writer';
import { UserRole } from '../domain/user/user-role';
import { CustomerAccountCommand, CustomerAdministrationAuthority } from './customers/customer-account';
import { ContentDraft, type ContentDraftData } from './content/content-draft';
import { ContentAuthority } from './content/content-types';
import { ApplyCapabilityStep, CapabilityCommandPhase as Phase, CapabilityLedgerCodec, type CapabilityProposal } from './capabilities/capability-ledger';
import { DemoSnapshotConflict } from './catalog/catalog-types';

@Injectable({ providedIn: 'root' })
export class DemoApplicationState {
  readonly writerStatus = DemoSnapshotWriter.browser.status.asReadonly();
  readonly commerce = new DemoCommerce();
  private readonly persistence = new DemoSnapshotPersistence(localStorage);
  readonly revision = signal(0);
  readonly context = signal(DemoContext.Unknown);
  readonly actorId = signal('cliente');
  readonly scenario = signal(DemoScenario.Approved);
  readonly message = signal('');
  readonly error = signal('');
  readonly role = signal(UserRole.Unknown);
  readonly sessionEpoch = signal(0);
  readonly sessionGeneration = signal('');
  private customerGeneration: number | null = null;
  private authorizationReadable = true;
  private persistedRevision = 0;
  private persistedRaw: string | null = null;
  constructor() {
    try { const persisted = this.persistence.load(this.commerce.snapshot); this.commerce.snapshot = persisted.snapshot; this.persistedRaw = persisted.raw; this.persistedRevision = persisted.snapshot.revision; } catch (error) { this.authorizationReadable = false; this.error.set(error instanceof SyntaxError ? 'Los datos Demo guardados no son válidos. Revisá la demostración o restablecela explícitamente.' : error instanceof Error ? error.message : 'No se pudo leer la demo guardada.'); }
    window.addEventListener('storage', event => { if (event.key === DemoSnapshotPersistence.key) { if (this.context() === DemoContext.Customer) { try { this.validateCustomerSession(); } catch { this.logout(); } } this.error.set('Los datos cambiaron en otra pestaña. Recargá antes de continuar.'); } });
    const savedContext = DemoContext.fromWire(sessionStorage.getItem('storecore.demo.context'));
    const savedActor = sessionStorage.getItem('storecore.demo.actor') ?? 'cliente';
    if (this.authorizationReadable && this.commerce.snapshot.actors.some(actor => actor.id === savedActor)) {
      this.actorId.set(savedActor);
      if (savedContext === DemoContext.Admin) { this.context.set(savedContext); this.role.set(UserRole.fromWire(sessionStorage.getItem('storecore.demo.role'))); }
      else if (savedContext === DemoContext.Customer) { const raw = sessionStorage.getItem('storecore.demo.generation'); this.customerGeneration = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null; try { this.validateCustomerSession(); this.context.set(savedContext); } catch { this.logout(); } }
    }
    if(this.context()!==DemoContext.Unknown){const generation=sessionStorage.getItem('storecore.demo.session-generation')||crypto.randomUUID();this.sessionGeneration.set(generation);sessionStorage.setItem('storecore.demo.session-generation',generation);}
  }
  get data() { this.revision(); return this.commerce.snapshot; }
  get authorizationAvailable(): boolean { return this.authorizationReadable; }
  get canReadCapabilities():boolean{return this.authorizationReadable&&this.context()===DemoContext.Admin&&[UserRole.Admin,UserRole.Operator].includes(this.role());}
  get canWriteCapabilities():boolean{return this.canReadCapabilities&&this.role()===UserRole.Admin;}
  applyCapability(proposal:CapabilityProposal):Phase {
    const authorized=()=>this.canWriteCapabilities&&this.actorId()===proposal.actor&&this.sessionEpoch()===proposal.epoch&&this.sessionGeneration()===proposal.sessionGeneration;
    if(!authorized())return Phase.Unauthorized;
    let result=Phase.Uncertain;
    this.run(()=>{
      if(!authorized())throw Error('El contexto cambió.');
      const ledger=this.data.capabilities??=CapabilityLedgerCodec.baseline();
      result=new ApplyCapabilityStep().execute(ledger,proposal);
      if(result===Phase.Conflict)throw new DemoSnapshotConflict('La versión o identidad del comando cambió.');
      if(result===Phase.Failed)throw Error('La propuesta no es válida.');
      if(result===Phase.Confirmed)this.commerce.touch();
    },'Registro comercial guardado localmente. No cambia productos ni rutas.',error=>{result=error instanceof DemoSnapshotConflict?Phase.Conflict:Phase.Uncertain;});
    return authorized()?result:Phase.Unauthorized;
  }
  recoverCapability(proposal:CapabilityProposal):Phase {
    const authorized=()=>this.canWriteCapabilities&&this.actorId()===proposal.actor&&this.sessionGeneration()===proposal.sessionGeneration;
    if(!authorized())return Phase.Unauthorized;
    const epoch=this.sessionEpoch();
    try{
      const persisted=this.persistence.load(this.commerce.snapshot);
      if(!authorized()||epoch!==this.sessionEpoch())return Phase.Unauthorized;
      // A fallback snapshot is useful for first exploration, never proof of a durable command.
      const receipt=persisted.raw===null?undefined:persisted.snapshot.capabilities?.receipts.find(r=>r.commandId===proposal.commandId);
      const fresh=this.persistence.load(this.commerce.snapshot);
      if(!authorized()||epoch!==this.sessionEpoch())return Phase.Unauthorized;
      if((persisted.raw===null)!==(fresh.raw===null))return Phase.Uncertain;
      if(fresh.raw===null)return Phase.Conflict;
      const freshReceipt=fresh.snapshot.capabilities?.receipts.find(r=>r.commandId===proposal.commandId);
      if(!receipt&&freshReceipt)return Phase.Uncertain;
      if(receipt&&(freshReceipt?.payload!==receipt.payload||freshReceipt.version!==receipt.version))return Phase.Uncertain;
      this.commerce.snapshot=fresh.snapshot;this.persistedRaw=fresh.raw;this.persistedRevision=fresh.snapshot.revision;this.revision.update(value=>value+1);
      return receipt?(receipt.payload===ApplyCapabilityStep.payload(proposal)?Phase.AlreadyApplied:Phase.Conflict):Phase.Conflict;
    }catch{return Phase.Uncertain;}
  }
  /** Explicit read-only reconciliation for an authorized operational command. */
  reloadOrderSnapshot(actor:string,epoch:number):boolean {
    if(!this.authorizationReadable||this.context()!==DemoContext.Admin||![UserRole.Admin,UserRole.Operator].includes(this.role())||this.actorId()!==actor||this.sessionEpoch()!==epoch)return false;
    try{const persisted=this.persistence.load(this.commerce.snapshot);if(this.actorId()!==actor||this.sessionEpoch()!==epoch)return false;this.commerce.snapshot=persisted.snapshot;this.persistedRaw=persisted.raw;this.persistedRevision=persisted.snapshot.revision;this.revision.update(value=>value+1);return true;}catch(error){this.error.set(error instanceof Error?error.message:'No se pudo revisar el estado actual.');return false;}
  }
  get canEditContent(): boolean { return this.authorizationReadable && ContentAuthority.permits(this.context(), this.role()); }
  saveContentDraft(draft: ContentDraftData, epoch: number): boolean {
    if (!this.canEditContent || epoch !== this.sessionEpoch()) return false;
    return this.run(() => {
      if (!this.canEditContent || epoch !== this.sessionEpoch()) throw new Error('El contexto cambió. Ingresá nuevamente.');
      this.data.contentDraft = ContentDraft.fromWire(draft); this.commerce.touch();
    }, 'Borrador guardado en esta Demo. La tienda actual no cambió.');
  }
  get canConfigureProfile():boolean{return this.authorizationReadable&&this.context()===DemoContext.Admin&&this.role()===UserRole.Admin&&!!this.sessionGeneration()&&this.data.actors.some(a=>a.id===this.actorId());}
  profileAuthority():string{return JSON.stringify([this.actorId(),this.sessionEpoch(),this.sessionGeneration()]);}
  readProfile(){
    if(!this.canConfigureProfile)throw Error('Acceso denegado.');
    const authority=this.profileAuthority(),raw=this.persistence.raw();
    let snapshot;
    try{snapshot=decodeSnapshot(raw??JSON.stringify(this.commerce.snapshot));}catch{throw new ProfileAuthorityRevoked('El snapshot no permite verificar la autoridad.');}
    const loaded={raw,snapshot};
    if(!this.canConfigureProfile||authority!==this.profileAuthority()||!loaded.snapshot.actors.some(a=>a.id===this.actorId()))throw new ProfileAuthorityRevoked('Acceso denegado.');
    if(this.persistedRaw!==null&&loaded.raw===null)throw new DemoSnapshotConflict('Los datos guardados desaparecieron. Recargá la Demo.');
    return{authority,raw:loaded.raw,revision:loaded.snapshot.revision,profile:StoreProfileCodec.fromWire(loaded.snapshot.storeProfile),sections:ProfileSectionsCodec.fromStoredWire(loaded.snapshot.profileSections)};
  }
  private profileWriting=false;
  writeProfile(expected:{authority:string;raw:string|null;revision:number},profile:StoreProfile|null,manifest:DemoProfileManifest|null):ProfileCommandResult {
    const authorized=()=>this.canConfigureProfile&&this.profileAuthority()===expected.authority;
    if(!authorized())return ProfileCommandResult.Denied;
    if(this.profileWriting)return ProfileCommandResult.Conflict;
    try{this.readProfile();}catch(error){return error instanceof ProfileAuthorityRevoked?ProfileCommandResult.Denied:error instanceof DemoSnapshotConflict?ProfileCommandResult.Conflict:ProfileCommandResult.Failed;}
    this.profileWriting=true;let authorityLost=false;
    try{
      const result=this.persistence.transactProfile(expected.raw,expected.revision,()=>{
        if(!authorized())throw Error('Acceso denegado.');
        const candidate=decodeSnapshot(JSON.stringify(this.persistence.current(this.commerce.snapshot)));
        if(!candidate.actors.some(a=>a.id===this.actorId())){authorityLost=true;throw new ProfileAuthorityRevoked('Acceso denegado.');}
        const prior=JSON.stringify([candidate.storeProfile,candidate.profileSections]);
        if(profile)candidate.storeProfile=StoreProfileCodec.fromWire(profile);
        else if(manifest)candidate.profileSections=new MergeDemoProfileStep().execute(ProfileSectionsCodec.fromStoredWire(candidate.profileSections),manifest);
        else throw Error('Comando desconocido.');
        if(!authorized())throw Error('Acceso denegado.');
        if(prior!==JSON.stringify([candidate.storeProfile,candidate.profileSections])||expected.raw===null)candidate.revision++;return candidate;
      });
      if(!authorized())return ProfileCommandResult.Denied;
      this.commerce.snapshot=result.snapshot;this.persistedRaw=result.raw;this.persistedRevision=result.snapshot.revision;this.revision.update(v=>v+1);return ProfileCommandResult.Saved;
    }catch(error){return authorityLost||!authorized()?ProfileCommandResult.Denied:error instanceof DemoSnapshotConflict?ProfileCommandResult.Conflict:error instanceof DemoProfileWriteFailure?ProfileCommandResult.Failed:ProfileCommandResult.Uncertain;}
    finally{this.profileWriting=false;}
  }
  get canResetDemo(): boolean { return !this.authorizationReadable || this.context() !== DemoContext.Admin || this.role() === UserRole.Admin; }
  get actor() { this.revision(); return this.commerce.actor(this.actorId()); }
  run(action: () => void, result: string, onFailure?: (error:unknown)=>void): boolean {
    this.error.set(''); this.message.set('');
    const before = JSON.stringify(this.commerce.snapshot);
    try {
      if (!this.authorizationReadable) throw new Error('Los datos guardados no son válidos. Restablecé explícitamente la demo.');
      if (this.context() === DemoContext.Customer) this.validateCustomerSession();
      const persisted = this.persistence.transact(this.persistedRaw, this.persistedRevision, () => { action(); return this.commerce.snapshot; });
      this.commerce.snapshot = persisted.snapshot; this.persistedRaw = persisted.raw; this.persistedRevision = persisted.snapshot.revision;
      this.revision.update(value => value + 1); this.message.set(result); this.revokeAffectedSession(); return true;
    } catch (error) { this.commerce.snapshot = decodeSnapshot(before); this.revision.update(value => value + 1); this.error.set(error instanceof Error ? error.message : 'No se pudo completar la operación.'); onFailure?.(error); return false; }
  }
  login(context: DemoContext, actor = 'cliente', role = UserRole.Admin): boolean {
    try {
      sessionStorage.removeItem('storecore.demo.capability-pending');
      const sessionGeneration=crypto.randomUUID();this.sessionGeneration.set(sessionGeneration);sessionStorage.setItem('storecore.demo.session-generation',sessionGeneration);
      if (!this.authorizationReadable) throw new Error('La autorización guardada no es válida. Restablecé la demo.');
      if (this.persistedRaw !== null && this.persistence.raw() === null) throw new Error('Los datos guardados desaparecieron. Recargá la Demo.');
      const current = this.persistence.current(this.commerce.snapshot); const access = current.actors.find(value => value.id === actor)?.access;
      if (context === DemoContext.Customer && !access?.state.permitsAccess) throw new Error('Esta cuenta está restringida o no tiene un estado reconocido.');
      this.sessionEpoch.update(value => value + 1); this.actorId.set(actor); this.context.set(context); this.role.set(context === DemoContext.Admin ? role : UserRole.Unknown);
      this.customerGeneration = context === DemoContext.Customer ? access!.generation : null;
      sessionStorage.setItem('storecore.demo.context', context.wire); sessionStorage.setItem('storecore.demo.actor', actor); sessionStorage.setItem('storecore.demo.role', this.role().wire);
      if (this.customerGeneration !== null) sessionStorage.setItem('storecore.demo.generation', String(this.customerGeneration)); else sessionStorage.removeItem('storecore.demo.generation');
      this.error.set(''); return true;
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'No se pudo iniciar sesión.'); return false; }
  }
  validateCustomerSession(): void {
    if (!this.authorizationReadable || this.customerGeneration === null) throw new Error('Iniciá una nueva sesión Demo.');
    if (this.persistedRaw !== null && this.persistence.raw() === null) throw new Error('Los datos guardados desaparecieron. Recargá la Demo.');
    const current = this.persistence.current(this.commerce.snapshot); const access = current.actors.find(value => value.id === this.actorId())?.access;
    if (!access?.state.permitsAccess || access.generation !== this.customerGeneration) throw new Error('La sesión Demo fue revocada. Iniciá sesión nuevamente.');
  }
  private revokeAffectedSession(): void { if (this.context() === DemoContext.Customer) { try { this.validateCustomerSession(); } catch { this.logout(); } } }
  changeCustomerAccount(id: string, command: CustomerAccountCommand, reason: string): boolean { if (this.context() !== DemoContext.Admin || !CustomerAdministrationAuthority.canWrite(this.role())) { this.error.set('Acceso denegado.'); return false; } return this.run(() => this.commerce.changeCustomerAccount(this.role(), id, command, reason), 'Estado de la cuenta guardado en esta Demo.'); }
  logout(): void { this.sessionGeneration.set('');sessionStorage.removeItem('storecore.demo.session-generation');sessionStorage.removeItem('storecore.demo.capability-pending'); this.sessionEpoch.update(value => value + 1); this.customerGeneration = null; this.role.set(UserRole.Unknown); this.context.set(DemoContext.Unknown); sessionStorage.removeItem('storecore.demo.context'); sessionStorage.removeItem('storecore.demo.actor'); sessionStorage.removeItem('storecore.demo.generation'); sessionStorage.removeItem('storecore.demo.role'); this.message.set('Sesión demo cerrada.'); }
  reset(): boolean {
    if (!this.canResetDemo) { this.error.set('El rol Operador no puede restablecer los datos Demo.'); return false; }
    try {
      let storedRevision = this.persistedRevision;
      try { storedRevision = this.persistence.revisionOr(storedRevision); } catch { /* Reset repairs corrupt persistence. */ }
      const next = demoSeed(); next.revision = Math.max(storedRevision, this.persistedRevision) + 1;
      next.actors.forEach(actor => { if (actor.access) actor.access.generation = next.revision; });
      const persisted = this.persistence.replace(next);
      this.commerce.snapshot = persisted.snapshot; this.persistedRevision = persisted.snapshot.revision; this.persistedRaw = persisted.raw;
      this.authorizationReadable = true;
      this.actorId.set('cliente'); this.logout(); this.scenario.set(DemoScenario.Approved); this.revision.update(value => value + 1); this.error.set(''); this.message.set('Demostración restablecida.');
      return true;
    } catch { this.error.set('No se pudo restablecer la demostración.'); return false; }
  }
}
