import {MLAction,MLAccountState,MLMappingState,MLIntentType,MLEventType,type MLLedger,type MLIntent,type MLAttempt} from './ml-types';
import {MLCommandPayload} from './ml-command-payload';
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const current=(i:MLIntent)=>i.attempts[i.attempts.length-1];
const status=(i:MLIntent)=>current(i).events.at(-1)!.type;
const destination=(m:{account:string;listing:string;variation:string})=>JSON.stringify([m.account,m.listing,m.variation]);
const scope=(a:MLIntent,b:MLIntent)=>a.sku===b.sku&&a.type===b.type&&a.accountGeneration===b.accountGeneration&&a.mappingGeneration===b.mappingGeneration&&a.destination===b.destination;
function fail():never{throw Error('El historial Mercado Libre no acredita el estado guardado.');}
/** Replays only local evidence. A number never manufactures a confirmation event. */
export class MLLedgerGraph {
 static validate(actual:MLLedger):void {
  const expected:MLLedger={account:{state:MLAccountState.Disconnected,generation:0,identity:''},mappings:[],intents:[],commands:[]};
  const dates=new Map<string,string>();
  for(const i of actual.intents)for(const a of i.attempts)for(const e of a.events){const known=dates.get(e.id);if(known&&known!==e.date)fail();dates.set(e.id,e.date);}
  const live=(i:MLIntent)=>expected.account.state===MLAccountState.Connected&&expected.account.generation===i.accountGeneration&&expected.mappings.some(m=>m.sku===i.sku&&m.generation===i.mappingGeneration&&destination(m)===i.destination);
  for(const record of actual.commands){
   const c=MLCommandPayload.fromWire(record.payload);
   if(c.context){const m=c.action.targetsMapping?expected.mappings.find(m=>m.sku===c.sku):undefined;const context={reviewedAccount:expected.account.identity,accountGeneration:expected.account.generation,mappingGeneration:m?.generation??0,reviewedDestination:m?destination(m):''};if(!equal(c.context,context))fail();}
   const event=(a:MLAttempt,type:MLEventType)=>{const date=dates.get(record.id);if(!date)fail();a.events.push({id:record.id,type,actor:c.actor,date});};
   const fence=(predicate:(i:MLIntent)=>boolean)=>{for(const i of expected.intents.filter(predicate))event(current(i),MLEventType.Superseded);};
   if(c.action===MLAction.Connect||c.action===MLAction.Disconnect){
    if(c.action===MLAction.Disconnect&&c.account!==expected.account.identity)fail();
    if(c.action===MLAction.Connect&&!c.account.trim())fail();
    fence(i=>status(i)!==MLEventType.Superseded);
    expected.account={state:c.action===MLAction.Connect?MLAccountState.Connected:MLAccountState.Disconnected,generation:expected.account.generation+1,identity:c.action===MLAction.Connect?c.account.trim():expected.account.identity};
   }else if(c.action===MLAction.Mapping){
    if(c.account!==expected.account.identity)fail();
    if(expected.account.state!==MLAccountState.Connected||!c.sku||!c.listing.trim())fail();
    const m={sku:c.sku,state:MLMappingState.Complete,generation:(expected.mappings.find(m=>m.sku===c.sku)?.generation??0)+1,account:expected.account.identity,listing:c.listing.trim(),variation:c.variation.trim()};
    if(expected.mappings.some(other=>other.sku!==c.sku&&destination(other)===destination(m)))fail();
    fence(i=>i.sku===c.sku);expected.mappings=expected.mappings.filter(m=>m.sku!==c.sku);expected.mappings.push(m);
   }else if(c.action===MLAction.Intent){
    const stored=actual.intents.find(i=>i.id===record.id),m=expected.mappings.find(m=>m.sku===c.sku);
    if(!stored||!m||expected.account.state!==MLAccountState.Connected||m.account!==expected.account.identity||stored.sku!==c.sku||stored.accountGeneration!==expected.account.generation||stored.mappingGeneration!==m.generation||stored.destination!==destination(m)||destination(c)!==stored.destination||stored.type!==MLIntentType.Unknown&&stored.type!==c.type)fail();
    if(stored.type!==MLIntentType.Unknown){if(!stored.type.valid(stored.value)||c.capture!==undefined&&!equal(stored.value,c.capture)||stored.type!==MLIntentType.Stock&&!equal(stored.value,c.value)||stored.payload!==JSON.stringify([stored.sku,stored.type.wire,stored.value]))fail();}
    const i:MLIntent={...stored,observed:undefined,attempts:[{id:record.id,events:[]}]};
    const known=expected.intents.filter(p=>scope(p,i)&&p.observed!==undefined).at(-1);if(known)i.observed=known.observed;
    fence(p=>scope(p,i)&&status(p)!==MLEventType.Superseded);event(current(i),MLEventType.Queued);expected.intents.push(i);
   }else{
    const i=expected.intents.find(i=>i.id===c.intent),a=i?.attempts.find(a=>a.id===c.attempt);if(!i||!a)fail();
    if(c.sku!==i.sku||destination(c)!==i.destination||c.type!==MLIntentType.Unknown&&i.type!==MLIntentType.Unknown&&c.type!==i.type||i.type!==MLIntentType.Unknown&&!equal(c.value,i.value))fail();
    if(c.action===MLAction.Retry){if(!live(i)||a!==current(i)||status(i)!==MLEventType.Rejected)fail();event(a,MLEventType.Superseded);const retry={id:record.id,events:[]};event(retry,MLEventType.Queued);i.attempts.push(retry);}
    else if(c.action===MLAction.Send){if(!live(i)||a!==current(i)||status(i)!==MLEventType.Queued)fail();event(a,MLEventType.Sent);}
    else if(c.action===MLAction.Outcome){
     if(![MLEventType.Confirmed,MLEventType.Rejected].includes(c.outcome))fail();
     if(!live(i)||a!==current(i)||status(i)===MLEventType.Superseded)event(a,MLEventType.Superseded);
     else{if(![MLEventType.Queued,MLEventType.Sent].includes(status(i)))fail();event(a,c.outcome);if(c.outcome===MLEventType.Confirmed)i.observed=i.value;}
    }else fail();
   }
  }
  if(actual.account.generation!==expected.account.generation||actual.account.identity!==expected.account.identity||actual.account.state!==MLAccountState.Unknown&&actual.account.state!==expected.account.state||actual.mappings.length!==expected.mappings.length||actual.intents.length!==expected.intents.length)fail();
  for(const m of actual.mappings){const e=expected.mappings.find(e=>e.sku===m.sku);if(!e||m.state!==MLMappingState.Unknown&&m.state!==e.state||!equal({...m,state:MLMappingState.Complete},{...e,state:MLMappingState.Complete}))fail();}
  for(const i of actual.intents){
   const e=expected.intents.find(e=>e.id===i.id);if(!e||!equal(i.observed,e.observed)||i.attempts.length!==e.attempts.length)fail();
   i.attempts.forEach((a,index)=>{const expectedAttempt=e.attempts[index];if(a.id!==expectedAttempt.id||a.events.length!==expectedAttempt.events.length)fail();a.events.forEach((v,n)=>{const wanted=expectedAttempt.events[n];if(!equal({...v,type:wanted.type},{...wanted})||v.type!==MLEventType.Unknown&&v.type!==wanted.type)fail();});});
  }
 }
}
