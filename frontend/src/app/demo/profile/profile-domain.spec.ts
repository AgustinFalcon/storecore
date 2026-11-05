import { TestBed } from '@angular/core/testing';
import { DemoApplicationState } from '../demo-state';
import { DemoSnapshotWriter } from '../demo-snapshot-writer';
import { DemoContext, decodeSnapshot, demoSeed } from '../demo-model';
import { UserRole } from '../../domain/user/user-role';
import { DemoSnapshotPersistence } from '../demo-snapshot-persistence';
import { StoreProfileCodec as Store, ProfileSectionsCodec as Sections, ProfileCurrency, ProfileTimeZone, ParseDemoProfileStep, PreviewDemoProfileStep, MergeDemoProfileStep, ProfileCommandResult as Result, ProfileCompatibility as Compatibility, ProfileDiffOperation as Operation, DEMO_PROFILE_EXAMPLE } from './profile-domain';
const parse=new ParseDemoProfileStep();
const manifest=()=>JSON.parse(DEMO_PROFILE_EXAMPLE);
const section=()=>manifest().content.homeSections[0];
describe('SC25 closed contracts and isolated snapshot upgrade',()=>{
 it('maps unknown finite wire values to closed Unknown cases',()=>{for(const raw of [null,'future',{},undefined]){expect(ProfileCurrency.fromWire(raw)).toBe(ProfileCurrency.Unknown);expect(ProfileTimeZone.fromWire(raw)).toBe(ProfileTimeZone.Unknown);expect(Result.fromWire(raw)).toBe(Result.Unknown);expect(Operation.fromWire(raw)).toBe(Operation.Unknown);expect(Compatibility.fromWire(raw)).toBe(Compatibility.Unknown);}});
 it('exports exactly persisted five settings and validates optional contacts/fixed values',()=>{
  expect(Object.keys(JSON.parse(Store.export(Store.baseline())))).toEqual(['storeName','supportEmail','supportPhone','currency','timezone']);expect(Store.fromWire(Store.reset())).toEqual({...Store.baseline(),storeName:'Mi tienda',supportEmail:'',supportPhone:''});
  for(const patch of [{storeName:''},{supportEmail:'bad'},{supportPhone:'abc'},{currency:'USD'},{timezone:'UTC'},{extra:'x'}])expect(()=>Store.fromWire({...Store.baseline(),...patch})).toThrow();
 });
 it('migrates v9 additively, ignores unrelated legacy title and requires complete v10',()=>{
  const raw=decodeSnapshot(JSON.stringify(demoSeed()));raw.version=9;delete raw.storeProfile;delete raw.profileSections;raw.title='SC16 stays';const prior=JSON.stringify(raw);const next=decodeSnapshot(prior);expect(next.version).toBe(11);expect(next.storeProfile).toEqual(Store.baseline());expect(next.profileSections).toEqual([]);const{storeProfile:_,profileSections:__,...rest}=next;void _;void __;expect(JSON.parse(JSON.stringify({...rest,version:9}))).toEqual(JSON.parse(prior));expect(decodeSnapshot(JSON.stringify(next))).toEqual(next);
  for(const key of ['storeProfile','profileSections'])for(const value of [undefined,null,{},false]){const invalid={...next,[key]:value};expect(()=>decodeSnapshot(JSON.stringify(invalid))).toThrow();}
 });
 it('validates exact metadata, shape, unique selection and unsafe escaped credentials locally',()=>{
  for(const patch of [{profile_name:'other'},{profile_version:'2.0.0'},{coreCompatibility:'2.x'}])expect(parse.execute(JSON.stringify({...manifest(),...patch})).compatibility).toBe(Compatibility.Incompatible);
  for(const patch of [{version:'1.0.0'},{mergeSelection:{homeSections:[]}},{mergeSelection:{homeSections:['foreign']}},{mergeSelection:{homeSections:['welcome','welcome']}}])expect(()=>parse.execute(JSON.stringify({...manifest(),...patch}))).toThrow();
  expect(()=>parse.execute('{')).toThrow();expect(()=>parse.execute(DEMO_PROFILE_EXAMPLE.replace('heading','to\\u006ben'))).toThrow();
  for(const patch of [{active:undefined},{active:'true'},{sortOrder:-1},{sortOrder:1.1},{content:[]},{sectionKey:'BAD'}])expect(()=>Sections.fromWire([{...section(),...patch}])).toThrow();expect(()=>Sections.fromWire([section(),section()])).toThrow();
 });
 it('enforces UTF8 20,000 bytes and 100 sections; diff is semantic and subset merge preserves other keys',()=>{
  expect(Sections.fromWire(Array.from({length:100},(_,i)=>({...section(),sectionKey:'key-'+i})))).toHaveLength(100);expect(()=>Sections.fromWire(Array.from({length:101},(_,i)=>({...section(),sectionKey:'key-'+i})))).toThrow();
  expect(Sections.fromWire([{...section(),content:{x:'á'.repeat(9996)}}])).toHaveLength(1);expect(()=>Sections.fromWire([{...section(),content:{x:'á'.repeat(9997)}}])).toThrow();
  const preview=new PreviewDemoProfileStep(),incoming=parse.execute(DEMO_PROFILE_EXAMPLE),merge=new MergeDemoProfileStep();expect(preview.execute([],incoming.sections)[0].operation).toBe(Operation.Add);const current=merge.execute([],incoming);expect(preview.execute(current,incoming.sections)[0].operation).toBe(Operation.Unchanged);expect(preview.execute([{...current[0],content:{b:2,a:1}}],[{...current[0],content:{a:1,b:2}}])[0].operation).toBe(Operation.Unchanged);expect(preview.execute(current,[{...current[0],active:false}])[0].operation).toBe(Operation.Update);
  expect(merge.execute([...current,{...section(),sectionKey:'other'}],incoming).some(s=>s.sectionKey==='other')).toBe(true);expect(()=>merge.execute(current,{...incoming,selection:[]})).toThrow();expect(()=>merge.execute(current,{...incoming,compatibility:Compatibility.Unknown})).toThrow();
 });
});
describe('SC25 authority and scoped persistence',()=>{
 beforeEach(()=>{localStorage.clear();sessionStorage.clear();vi.spyOn(DemoSnapshotWriter.browser,'assertWritable').mockImplementation(()=>{});});
 afterEach(()=>{vi.restoreAllMocks();TestBed.resetTestingModule();});
 function setup(){const state=TestBed.inject(DemoApplicationState);state.login(DemoContext.Admin);return state;}
 function unrelated(state:DemoApplicationState){const{storeProfile:_,profileSections:__,revision:___,...rest}=state.data;void _;void __;void ___;return JSON.stringify(rest);}
 it('denies operator and unknown before exposing values and clears same-actor old generation',()=>{const state=setup(),expected=state.readProfile();for(const role of [UserRole.Operator,UserRole.Unknown]){state.role.set(role);expect(()=>state.readProfile()).toThrow();expect(state.writeProfile(expected,Store.reset(),null)).toBe(Result.Denied);}state.logout();state.login(DemoContext.Admin);expect(state.writeProfile(expected,Store.reset(),null)).toBe(Result.Denied);});
 it('save/reset/export and merge only affect their own aggregates and replay changes nothing',()=>{
  const state=setup(),prior=unrelated(state),sections=JSON.stringify(state.data.profileSections);expect(state.writeProfile(state.readProfile(),Store.reset(),null)).toBe(Result.Saved);expect(unrelated(state)).toBe(prior);expect(JSON.stringify(state.data.profileSections)).toBe(sections);expect(JSON.parse(Store.export(state.readProfile().profile))).toEqual(JSON.parse(JSON.stringify(Store.reset())));
  const settings=JSON.stringify(state.data.storeProfile),incoming=parse.execute(DEMO_PROFILE_EXAMPLE);expect(state.writeProfile(state.readProfile(),null,incoming)).toBe(Result.Saved);expect(unrelated(state)).toBe(prior);expect(JSON.stringify(state.data.storeProfile)).toBe(settings);const expected=state.readProfile(),revision=state.data.revision;expect(state.writeProfile(expected,null,incoming)).toBe(Result.Saved);expect(state.data.revision).toBe(revision);
 });
 it('blocks CAS equal-revision changes, deletion and post-preview conflicts with zero automatic reapply',()=>{
  const state=setup();state.writeProfile(state.readProfile(),Store.reset(),null);let expected=state.readProfile();const raw=JSON.parse(localStorage.getItem(DemoSnapshotPersistence.key)!);raw.storeProfile.storeName='Other tab';localStorage.setItem(DemoSnapshotPersistence.key,JSON.stringify(raw));expect(state.writeProfile(expected,null,parse.execute(DEMO_PROFILE_EXAMPLE))).toBe(Result.Conflict);expect(state.readProfile().sections).toEqual([]);expected=state.readProfile();localStorage.removeItem(DemoSnapshotPersistence.key);expect(state.writeProfile(expected,Store.reset(),null)).toBe(Result.Conflict);
 });
 it('classifies quota as known failure and readback mismatch as uncertain without rollback/retry',()=>{
  const state=setup(),expected=state.readProfile();const set=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('full','QuotaExceededError');});expect(state.writeProfile(expected,Store.reset(),null)).toBe(Result.Failed);expect(set).toHaveBeenCalledTimes(1);set.mockRestore();
  const actual=Storage.prototype.getItem,actualSet=Storage.prototype.setItem;let written=false;vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key:string,value:string){actualSet.call(this,key,value);written=true;});vi.spyOn(Storage.prototype,'getItem').mockImplementation(function(this:Storage,key:string){return written?'mismatch':actual.call(this,key);});expect(state.writeProfile(expected,Store.reset(),null)).toBe(Result.Uncertain);expect(JSON.parse(actual.call(localStorage,DemoSnapshotPersistence.key)!).storeProfile).toEqual(JSON.parse(JSON.stringify(Store.reset())));
 });
});

describe('SC25 Astra domain regressions',()=>{
 it('rejects separator-only phones and non-finite JSON numbers before normalization',()=>{
  for(const supportPhone of ['------','( ) - -','++++++','      '])expect(()=>Store.fromWire({...Store.baseline(),supportPhone})).toThrow();
  for(const value of [Infinity,-Infinity,NaN])expect(()=>Sections.fromWire([{...section(),content:{nested:[{value}]}}])).toThrow();
  expect(()=>parse.execute(DEMO_PROFILE_EXAMPLE.replace('"Bienvenido al comercio de muestra"','1e400'))).toThrow();
 });
 it('UNCHANGED selection preserves collection order, content key order and revision',()=>{
  const current=[{...section(),sectionKey:'first',content:{b:2,a:1}},{...section(),sectionKey:'second'}],incoming={sections:[{...current[0],content:{a:1,b:2}}],selection:['first'],compatibility:Compatibility.Compatible};
  expect(JSON.stringify(new MergeDemoProfileStep().execute(current,incoming))).toBe(JSON.stringify(current));
 });
 it('applies max100 to each input while the additive stored collection may exceed 100',()=>{
  const current=Array.from({length:100},(_,i)=>({...section(),sectionKey:'stored-'+i})),incoming=parse.execute(DEMO_PROFILE_EXAMPLE),merged=new MergeDemoProfileStep().execute(current,incoming);
  expect(merged).toHaveLength(101);const saved=demoSeed();saved.profileSections=merged;expect(decodeSnapshot(JSON.stringify(saved)).profileSections).toHaveLength(101);expect(()=>parse.execute(JSON.stringify({...manifest(),content:{homeSections:merged}}))).toThrow();
 });
 it('preflight read exception is known failure with zero writes',()=>{
  localStorage.clear();sessionStorage.clear();vi.spyOn(DemoSnapshotWriter.browser,'assertWritable').mockImplementation(()=>{});
  const state=TestBed.inject(DemoApplicationState);state.login(DemoContext.Admin);const expected=state.readProfile(),set=vi.spyOn(Storage.prototype,'setItem');vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('read unavailable');});
  expect(state.writeProfile(expected,Store.reset(),null)).toBe(Result.Failed);expect(set).not.toHaveBeenCalled();vi.restoreAllMocks();TestBed.resetTestingModule();
 });
});

describe('SC25 revocation at write preflight',()=>{
 it('denies a revoked persisted actor before CAS even while session signals remain unchanged',()=>{
 localStorage.clear();sessionStorage.clear();vi.spyOn(DemoSnapshotWriter.browser,'assertWritable').mockImplementation(()=>{});const state=TestBed.inject(DemoApplicationState);state.login(DemoContext.Admin);const expected=state.readProfile(),raw=JSON.parse(JSON.stringify(state.data));raw.actors=raw.actors.filter((a:{id:string})=>a.id!==state.actorId());localStorage.setItem(DemoSnapshotPersistence.key,JSON.stringify(raw));expect(state.writeProfile(expected,Store.reset(),null)).toBe(Result.Denied);expect(localStorage.getItem(DemoSnapshotPersistence.key)).toBe(JSON.stringify(raw));vi.restoreAllMocks();TestBed.resetTestingModule();
 });
});

describe('SC25 second Astra boundary regressions',()=>{
 it('rejects unsafe integer values recursively including the exact unrounded input literal',()=>{
  expect(()=>parse.execute(DEMO_PROFILE_EXAMPLE.replace('"Bienvenido al comercio de muestra"','9007199254740993'))).toThrow();
  expect(()=>Sections.fromWire([{...section(),content:{nested:[Number.MAX_SAFE_INTEGER+1]}}])).toThrow();
  expect(Sections.fromWire([{...section(),content:{nested:[Number.MAX_SAFE_INTEGER,1.5]}}])).toHaveLength(1);
 });
});
