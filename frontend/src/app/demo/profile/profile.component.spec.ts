import { TestBed } from '@angular/core/testing';
import { DemoApplicationState } from '../demo-state';
import { DemoContext } from '../demo-model';
import { DemoWriterStatus, DemoSnapshotWriter } from '../demo-snapshot-writer';
import { ProfileImportPhase, PreviewValidity } from '../../domain/user/profile-import';
import { DemoProfileComponent } from './profile.component';
import { DEMO_PROFILE_EXAMPLE, ProfileDialog, ProfileCommandResult, StoreProfileCodec } from './profile-domain';
describe('SC25 component command lifecycle',()=>{
 beforeEach(()=>{DemoSnapshotWriter.browser.status.set(DemoWriterStatus.Writable);localStorage.clear();sessionStorage.clear();vi.spyOn(DemoSnapshotWriter.browser,'assertWritable').mockImplementation(()=>{});TestBed.overrideComponent(DemoProfileComponent,{set:{template:''}});});
 afterEach(()=>{vi.restoreAllMocks();TestBed.resetTestingModule();});
 function setup(){const state=TestBed.inject(DemoApplicationState);state.login(DemoContext.Admin);const fixture=TestBed.createComponent(DemoProfileComponent);fixture.detectChanges();return{state,fixture,c:fixture.componentInstance};}
 it('example only fills editor and selection/editor changes invalidate even after restoring original text',()=>{const{c,state,fixture}=setup();const before=JSON.stringify(state.data);c.example();expect(c.manifest).toBe(DEMO_PROFILE_EXAMPLE);expect(JSON.stringify(state.data)).toBe(before);c.preview();expect(c.canMerge).toBe(true);c.close();c.select('welcome',false);expect(c.canMerge).toBe(false);c.select('welcome',true);expect(c.canMerge).toBe(false);c.preview();c.close();expect(c.canMerge).toBe(true);c.edit();expect(c.validity()).toBe(PreviewValidity.Stale);expect(c.canMerge).toBe(false);fixture.destroy();});
 it('reset cancel is a no-op; double dispatch writes once',async()=>{const{c,state,fixture}=setup();const before=JSON.stringify(state.data);c.open(ProfileDialog.Reset);c.close();expect(JSON.stringify(state.data)).toBe(before);c.open(ProfileDialog.Reset);const write=vi.spyOn(state,'writeProfile');await Promise.all([c.reset(),c.reset()]);expect(write).toHaveBeenCalledTimes(1);expect(state.data.storeProfile).toEqual(StoreProfileCodec.reset());fixture.destroy();});
 it('deferred commands are cancelled on destroy or same-actor logout/login and private proposals cleared',async()=>{for(const destroy of [false,true]){const{c,state,fixture}=setup(),write=vi.spyOn(state,'writeProfile');c.example();c.draft.storeName='Private';const pending=c.save();if(destroy)fixture.destroy();else{state.logout();state.login(DemoContext.Admin);fixture.detectChanges();}await pending;expect(write).not.toHaveBeenCalled();expect(c.manifest).toBe('');if(!destroy)fixture.destroy();}});
 it('recovers route drafts for the same session and warns before a browser unload',()=>{const{c,fixture}=setup();c.draft.storeName='Cambio pendiente de preservar';c.manifest='{"schemaVersion":1}';const unload=new Event('beforeunload',{cancelable:true}) as BeforeUnloadEvent;c.beforeUnload(unload);expect(unload.defaultPrevented).toBe(true);fixture.destroy();const next=TestBed.createComponent(DemoProfileComponent);next.detectChanges();expect(next.componentInstance.draft.storeName).toBe('Cambio pendiente de preservar');expect(next.componentInstance.manifest).toBe('{"schemaVersion":1}');expect(next.componentInstance.configStatus).toContain('Recuperamos');next.destroy();});
 it('conflict preserves proposal in RAM, blocks writes, and reread requires fresh preview/confirmation',async()=>{const{c,state,fixture}=setup();c.example();c.preview();c.close();c.open(ProfileDialog.Merge);vi.spyOn(state,'writeProfile').mockReturnValueOnce((await import('./profile-domain')).ProfileCommandResult.Conflict);await c.merge();expect(c.manifest).toBe(DEMO_PROFILE_EXAMPLE);expect(c.phase()).toBe(ProfileImportPhase.Failed);expect(c.canWrite).toBe(false);c.refresh();expect(c.manifest).toBe(DEMO_PROFILE_EXAMPLE);expect(c.canMerge).toBe(false);c.preview();c.close();expect(c.canMerge).toBe(true);fixture.destroy();});
});

describe('SC25 Astra component regressions',()=>{
 beforeEach(()=>{localStorage.clear();sessionStorage.clear();vi.spyOn(DemoSnapshotWriter.browser,'assertWritable').mockImplementation(()=>{});TestBed.overrideComponent(DemoProfileComponent,{set:{template:''}});});
 afterEach(()=>{vi.restoreAllMocks();TestBed.resetTestingModule();});
 function setup(){const state=TestBed.inject(DemoApplicationState);state.login(DemoContext.Admin);const fixture=TestBed.createComponent(DemoProfileComponent);fixture.detectChanges();return{state,fixture,c:fixture.componentInstance};}
 function remote(state:DemoApplicationState,patch:Record<string,string>){const raw=JSON.parse(JSON.stringify(state.data));raw.storeProfile={...raw.storeProfile,...patch};raw.revision++;localStorage.setItem('storecore.commercial-demo.v1',JSON.stringify(raw));}
 it('rebases only dirty fields, preserves disjoint concurrent settings and requires an overlap decision',async()=>{
  const{c,state,fixture}=setup();c.draft.storeName='Mine';remote(state,{supportPhone:'+54 11 4444 5555'});c.refresh();expect(c.draft.supportPhone).toBe('+54 11 4444 5555');expect(c.conflicts).toEqual([]);await c.save();expect(state.data.storeProfile?.supportPhone).toBe('+54 11 4444 5555');
  c.draft.storeName='Mine again';remote(state,{storeName:'Theirs'});c.refresh();expect(c.conflicts).toHaveLength(1);expect(c.canSave).toBe(false);c.keepDraft();expect(c.canSave).toBe(true);c.refresh();c.draft.storeName='Another draft';remote(state,{storeName:'Latest'});c.refresh();c.acceptRemote();expect(c.draft.storeName).toBe('Latest');expect(c.canSave).toBe(false);fixture.destroy();
 });
 it('import preserves the dirty config proposal and publishes its result only in import scope',async()=>{
  const{c,fixture}=setup();c.draft.storeName='Unsaved proposal';c.example();c.preview();c.close();c.open(ProfileDialog.Merge);await c.merge();expect(c.draft.storeName).toBe('Unsaved proposal');expect(c.configDirty).toBe(true);expect(c.configStatus).toBe('');expect(c.status).toBeTruthy();fixture.destroy();
 });
 it('settings save does not report import success and raw edits remove stale diff/selection',async()=>{
  const{c,fixture}=setup();c.example();c.preview();c.close();expect(c.changes.length).toBeGreaterThan(0);c.edit();expect(c.changes).toEqual([]);expect(c.selection).toEqual([]);c.draft.storeName='Only settings';await c.save();expect(c.status).toBe('');expect(c.configStatus).toBeTruthy();expect(c.phase()).not.toBe(ProfileImportPhase.Succeeded);fixture.destroy();
 });
 it('post-write refresh failure is recoverable without null dereference or success+error',async()=>{
  const{c,state,fixture}=setup();c.draft.storeName='Persist once';const actualRead=state.readProfile.bind(state),read=vi.spyOn(state,'readProfile').mockImplementationOnce(actualRead).mockImplementationOnce(()=>{throw Error('read failed');}),write=vi.spyOn(state,'writeProfile');await expect(c.save()).resolves.toBeUndefined();expect(write).toHaveBeenCalledTimes(1);expect(state.data.storeProfile?.storeName).toBe('Persist once');expect(c.draft.storeName).toBe('Persist once');expect(c.configStatus).toBe('');expect(c.configError).toContain('Releer');expect(c.canWrite).toBe(false);read.mockRestore();c.refresh();expect(c.canWrite).toBe(true);expect(write).toHaveBeenCalledTimes(1);fixture.destroy();
 });
 it('actor revocation hides and clears every private proposal including resetBefore',()=>{
  const{c,state,fixture}=setup();c.draft.storeName='Private';c.example();c.open(ProfileDialog.Reset);c.close();const raw=JSON.parse(JSON.stringify(state.data));raw.actors=raw.actors.filter((a:{id:string})=>a.id!==state.actorId());localStorage.setItem('storecore.commercial-demo.v1',JSON.stringify(raw));c.refresh();expect(c.authorized).toBe(false);expect(c.manifest).toBe('');expect(c.draft).toEqual(StoreProfileCodec.reset());expect(c.resetBefore).toEqual(StoreProfileCodec.reset());expect(c.exportText).toBe('');expect(c.dialog()).toBe(ProfileDialog.None);fixture.destroy();
 });
});

describe('SC25 review lifetime, writer and recovery regressions',()=>{
 beforeEach(()=>{DemoSnapshotWriter.browser.status.set(DemoWriterStatus.Writable);localStorage.clear();sessionStorage.clear();vi.spyOn(DemoSnapshotWriter.browser,'assertWritable').mockImplementation(()=>{});TestBed.overrideComponent(DemoProfileComponent,{set:{template:''}});});
 afterEach(()=>{vi.restoreAllMocks();TestBed.resetTestingModule();});
 function setup(){const state=TestBed.inject(DemoApplicationState);state.login(DemoContext.Admin);const fixture=TestBed.createComponent(DemoProfileComponent);fixture.detectChanges();return{state,fixture,c:fixture.componentInstance};}
 function remote(state:DemoApplicationState){const raw=JSON.parse(JSON.stringify(state.data));raw.storeProfile.supportPhone='+54 11 9999 8888';raw.revision++;localStorage.setItem('storecore.commercial-demo.v1',JSON.stringify(raw));return JSON.stringify(raw);}
 it('refresh closes all command reviews, preserves proposal, and requires a new preview/confirmation',()=>{
  for(const dialog of [ProfileDialog.Reset,ProfileDialog.Merge,ProfileDialog.Export]){
   const{c,state,fixture}=setup();c.draft.storeName='Keep proposal';if(dialog===ProfileDialog.Merge){c.example();c.preview();c.close();}c.open(dialog);expect(c.dialog()).toBe(dialog);const raw=remote(state);c.refresh();expect(c.dialog()).toBe(ProfileDialog.None);expect(c.draft.storeName).toBe('Keep proposal');expect(c.canMerge).toBe(false);expect(localStorage.getItem('storecore.commercial-demo.v1')).toBe(raw);fixture.destroy();TestBed.resetTestingModule();TestBed.overrideComponent(DemoProfileComponent,{set:{template:''}});localStorage.clear();sessionStorage.clear();
  }
 });
 it('reset and merge cannot apply a changed snapshot without a new review even if storage event was missed',async()=>{
  for(const dialog of [ProfileDialog.Reset,ProfileDialog.Merge]){const{c,state,fixture}=setup();if(dialog===ProfileDialog.Merge){c.example();c.preview();c.close();}c.open(dialog);const raw=remote(state),write=vi.spyOn(state,'writeProfile');if(dialog===ProfileDialog.Merge)await c.merge();else await c.reset();expect(write).not.toHaveBeenCalled();expect(c.dialog()).toBe(ProfileDialog.None);expect(c.canMerge).toBe(false);expect(localStorage.getItem('storecore.commercial-demo.v1')).toBe(raw);fixture.destroy();TestBed.resetTestingModule();TestBed.overrideComponent(DemoProfileComponent,{set:{template:''}});localStorage.clear();sessionStorage.clear();}
 });
 it('download revalidates the exact reviewed snapshot and revocation before creating a download',()=>{
  const{c,state,fixture}=setup();c.open(ProfileDialog.Export);remote(state);const create=vi.spyOn(document,'createElement');c.download();expect(create).not.toHaveBeenCalled();expect(c.dialog()).toBe(ProfileDialog.None);c.open(ProfileDialog.Export);const raw=JSON.parse(JSON.stringify(state.data));raw.actors=raw.actors.filter((a:{id:string})=>a.id!==state.actorId());localStorage.setItem('storecore.commercial-demo.v1',JSON.stringify(raw));c.download();expect(create).not.toHaveBeenCalled();expect(c.authorized).toBe(false);expect(c.exportText).toBe('');expect(c.manifest).toBe('');expect(c.resetBefore).toEqual(StoreProfileCodec.reset());fixture.destroy();
 });
 it('canMerge rejects missing/stale snapshot, failure and UNCHANGED-only selections',async()=>{
  const{c,state,fixture}=setup();c.example();c.preview();c.close();c.open(ProfileDialog.Merge);await c.merge();c.preview();c.close();expect(c.canMerge).toBe(false);c.example();c.manifest=c.manifest.replace('Bienvenido al comercio de muestra','New incoming');c.edit();c.preview();c.close();expect(c.canMerge).toBe(true);remote(state);expect(c.canMerge).toBe(false);fixture.destroy();
 });
 it('read-only writer disables commands while local preview and export remain available',()=>{
  const{c,fixture}=setup();DemoSnapshotWriter.browser.status.set(DemoWriterStatus.ReadOnly);c.draft.storeName='Proposal';expect(c.canSave).toBe(false);expect(c.canPersist).toBe(false);c.open(ProfileDialog.Reset);expect(c.dialog()).toBe(ProfileDialog.None);c.example();c.preview();expect(c.dialog()).toBe(ProfileDialog.Preview);c.close();expect(c.canMerge).toBe(false);c.open(ProfileDialog.Export);expect(c.dialog()).toBe(ProfileDialog.Export);expect(c.exportText).toContain('Heragon');fixture.destroy();
 });
 it('successful manual refresh replaces failure guidance and keeps the proposal recoverable',async()=>{
  const{c,state,fixture}=setup();const{ProfileCommandResult}=await import('./profile-domain');c.draft.storeName='Recover me';vi.spyOn(state,'writeProfile').mockReturnValueOnce(ProfileCommandResult.Failed);await c.save();expect(c.configStatus).toContain('No se guardó');expect(c.canSave).toBe(false);c.refresh();expect(c.configStatus).toContain('recuperado');expect(c.configStatus).not.toContain('No se guardó');expect(c.draft.storeName).toBe('Recover me');expect(c.canSave).toBe(true);fixture.destroy();
 });
});

describe('SC25 final UX focus and guidance regressions',()=>{
 beforeEach(()=>{vi.useFakeTimers();DemoSnapshotWriter.browser.status.set(DemoWriterStatus.Writable);localStorage.clear();sessionStorage.clear();vi.spyOn(DemoSnapshotWriter.browser,'assertWritable').mockImplementation(()=>{});TestBed.overrideComponent(DemoProfileComponent,{set:{template:'<h1 id="configuration-heading" tabindex="-1">Configuración</h1><button id="next-control">Releer estado local</button>'}});});
 afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();TestBed.resetTestingModule();});
 function setup(){const state=TestBed.inject(DemoApplicationState);state.login(DemoContext.Admin);const fixture=TestBed.createComponent(DemoProfileComponent);fixture.detectChanges();return{state,fixture,c:fixture.componentInstance};}
 it('writer read-only does not claim a current ADD review is stale or has no changes',()=>{
  const{c,state,fixture}=setup();DemoSnapshotWriter.browser.status.set(DemoWriterStatus.ReadOnly);c.example();c.preview();c.close();expect(c.canMerge).toBe(false);expect(c.reviewNeedsAttention).toBe(false);const raw=JSON.parse(JSON.stringify(state.data));raw.revision++;localStorage.setItem('storecore.commercial-demo.v1',JSON.stringify(raw));expect(c.reviewNeedsAttention).toBe(true);fixture.destroy();
 });
 it.each([ProfileCommandResult.Failed,ProfileCommandResult.Uncertain])('failed or uncertain save focuses a stable heading once after render: %s',async result=>{
  const{c,state,fixture}=setup();c.draft.storeName='Proposal';const heading=fixture.nativeElement.querySelector('#configuration-heading') as HTMLElement,next=fixture.nativeElement.querySelector('#next-control') as HTMLElement,focus=vi.spyOn(heading,'focus');vi.spyOn(state,'writeProfile').mockReturnValueOnce(result);await c.save();fixture.detectChanges();await vi.advanceTimersByTimeAsync(0);expect(document.activeElement).toBe(heading);expect(focus).toHaveBeenCalledTimes(1);next.focus();await vi.advanceTimersByTimeAsync(60);expect(document.activeElement).toBe(next);expect(c.canSave).toBe(false);fixture.destroy();
 });
 it.each([ProfileCommandResult.Failed,ProfileCommandResult.Uncertain])('failed or uncertain confirmed merge keeps focus off BODY: %s',async result=>{
  const{c,state,fixture}=setup();c.example();c.preview();c.close();c.open(ProfileDialog.Merge);const heading=fixture.nativeElement.querySelector('#configuration-heading') as HTMLElement,next=fixture.nativeElement.querySelector('#next-control') as HTMLElement;vi.spyOn(state,'writeProfile').mockReturnValueOnce(result);await c.merge();fixture.detectChanges();await vi.advanceTimersByTimeAsync(0);expect(document.activeElement).toBe(heading);expect(c.canMerge).toBe(false);next.focus();await vi.advanceTimersByTimeAsync(60);expect(document.activeElement).toBe(next);fixture.destroy();
 });
});

describe('SC25 final success and denial focus transitions',()=>{
 beforeEach(()=>{vi.useFakeTimers();DemoSnapshotWriter.browser.status.set(DemoWriterStatus.Writable);localStorage.clear();sessionStorage.clear();vi.spyOn(DemoSnapshotWriter.browser,'assertWritable').mockImplementation(()=>{});TestBed.overrideComponent(DemoProfileComponent,{set:{template:'@if(authorized){<h1 id="configuration-heading" tabindex="-1">Configuración</h1><button id="next-control">Siguiente</button>}@else{<h1 id="configuration-denied-heading" tabindex="-1">Acceso denegado</h1><button id="next-control">Ingresar</button>}'}});});
 afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();TestBed.resetTestingModule();});
 function setup(){const state=TestBed.inject(DemoApplicationState);state.login(DemoContext.Admin);const fixture=TestBed.createComponent(DemoProfileComponent);fixture.detectChanges();return{state,fixture,c:fixture.componentInstance};}
 it('successful settings save focuses heading after the submit becomes disabled, then lets focus move',async()=>{
  const{c,fixture}=setup();c.draft.storeName='Saved settings';await c.save();fixture.detectChanges();expect(c.canSave).toBe(false);const heading=fixture.nativeElement.querySelector('#configuration-heading') as HTMLElement,focus=vi.spyOn(heading,'focus');await vi.advanceTimersByTimeAsync(0);expect(document.activeElement).toBe(heading);expect(focus).toHaveBeenCalledTimes(1);const next=fixture.nativeElement.querySelector('#next-control') as HTMLElement;next.focus();await vi.advanceTimersByTimeAsync(60);expect(document.activeElement).toBe(next);fixture.destroy();
 });
 const transitions=[
  (c:DemoProfileComponent)=>c.refresh(),
  (c:DemoProfileComponent)=>c.storageChanged(new StorageEvent('storage',{key:'storecore.commercial-demo.v1'})),
  (c:DemoProfileComponent)=>c.download(),
  (c:DemoProfileComponent)=>{c.close();c.open(ProfileDialog.Export);},
  (c:DemoProfileComponent)=>{c.close();c.example();c.preview();},
 ];
 it.each(transitions)('actor revocation while export is open clears data and focuses denial for every read transition',async transition=>{
  const{c,state,fixture}=setup();c.open(ProfileDialog.Export);expect(c.dialog()).toBe(ProfileDialog.Export);const raw=JSON.parse(JSON.stringify(state.data));raw.actors=raw.actors.filter((actor:{id:string})=>actor.id!==state.actorId());localStorage.setItem('storecore.commercial-demo.v1',JSON.stringify(raw));transition(c);fixture.detectChanges();const heading=fixture.nativeElement.querySelector('#configuration-denied-heading') as HTMLElement;expect(heading).not.toBeNull();const focus=vi.spyOn(heading,'focus');await vi.advanceTimersByTimeAsync(0);expect(document.activeElement).toBe(heading);expect(focus).toHaveBeenCalledTimes(1);expect(c.exportText).toBe('');expect(c.dialog()).toBe(ProfileDialog.None);const next=fixture.nativeElement.querySelector('#next-control') as HTMLElement;next.focus();await vi.advanceTimersByTimeAsync(60);expect(document.activeElement).toBe(next);fixture.destroy();
 });
});
