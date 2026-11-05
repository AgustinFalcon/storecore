import {DemoModuleId,type DemoSnapshot} from '../demo-model';
import {InventoryAccess,InventoryPool,type InventoryAuthority} from '../inventory/inventory-flow';
import {MLLedgerCodec} from './ml-codec';
import {MLCommandPayload,type MLReviewedContext} from './ml-command-payload';
import {MLIntentPolicy} from './ml-intent-policy';
import {MLAction,MLAccountState,MLMappingState,MLIntentType,MLPublication,MLEventType,MLResult,type MLIntent,type MLLedger,type MLAttempt} from './ml-types';
export interface MLCommand extends MLReviewedContext {id:string;action:MLAction;actor:string;epoch:number;revision:number;sku:string;type:MLIntentType;value:number|MLPublication;account:string;listing:string;variation:string;intent:string;attempt:string;outcome:MLEventType;}
export const mlLedger=(s:DemoSnapshot):MLLedger=>s.mercadolibre??MLLedgerCodec.empty();
export const mlCurrent=(i:MLIntent)=>i.attempts[i.attempts.length-1];
export const mlStatus=(i:MLIntent)=>mlCurrent(i).events.at(-1)!.type;
export const mlDestination=(m:{account:string;listing:string;variation:string})=>JSON.stringify([m.account,m.listing,m.variation]);
export const mlReviewContext=(s:DemoSnapshot,action:MLAction,sku:string):MLReviewedContext=>{const l=mlLedger(s),m=action.targetsMapping?l.mappings.find(m=>m.sku===sku):undefined;return{reviewedAccount:l.account.identity,accountGeneration:l.account.generation,mappingGeneration:m?.generation??0,reviewedDestination:m?mlDestination(m):''};};
export const mlSameReviewContext=(a:MLReviewedContext,b:MLReviewedContext)=>a.reviewedAccount===b.reviewedAccount&&a.accountGeneration===b.accountGeneration&&a.mappingGeneration===b.mappingGeneration&&a.reviewedDestination===b.reviewedDestination;
const sameScope=(a:MLIntent,b:MLIntent)=>a.sku===b.sku&&a.mappingGeneration===b.mappingGeneration&&a.accountGeneration===b.accountGeneration&&a.destination===b.destination&&a.type===b.type;
const live=(l:MLLedger,i:MLIntent)=>l.account.state===MLAccountState.Connected&&l.account.generation===i.accountGeneration&&l.mappings.some(m=>m.sku===i.sku&&m.state===MLMappingState.Complete&&m.generation===i.mappingGeneration&&mlDestination(m)===i.destination);
export abstract class MLStep {
 abstract readonly action:MLAction;
 abstract apply(s:DemoSnapshot,l:MLLedger,c:MLCommand,actor:string,date:string):boolean;
 execute(s:DemoSnapshot,a:InventoryAuthority,c:MLCommand,date:string):MLResult {
  if(!InventoryAccess.permits(a)||a.actor!==c.actor||a.epoch!==c.epoch)return MLResult.Denied;
  if(!s.modules.some(m=>m.id===DemoModuleId.MercadoLibre&&m.enabled===true))return MLResult.Blocked;
  const l=mlLedger(s),target=l.intents.find(i=>i.id===c.intent);
  if([MLAction.Send,MLAction.Retry,MLAction.Outcome].includes(this.action)&&(!target||!MLIntentPolicy.unknownReason(l,target).permitted))return MLResult.Blocked;
  if(target&&(c.sku!==target.sku||c.type!==target.type||JSON.stringify(c.value)!==JSON.stringify(target.value)||mlDestination(c)!==target.destination))return MLResult.Conflict;
  const previous=l.commands.find(v=>v.id===c.id),old=previous?MLCommandPayload.fromWire(previous.payload):null;
  const capture=this.action===MLAction.Intent?(old?.capture??(c.type===MLIntentType.Stock?new StockIntent().capture(s,c):c.value)):undefined;
  const fields:unknown[]=[this.action.label,c.actor,c.sku,c.type.wire,c.value,c.account,c.listing,c.variation,c.intent,c.attempt,c.outcome.wire];
  if(!old||old.formatLength===13){fields.push(this.action===MLAction.Intent?capture:null,{reviewedAccount:c.reviewedAccount,accountGeneration:c.accountGeneration,mappingGeneration:c.mappingGeneration,reviewedDestination:c.reviewedDestination});}else if(old.formatLength===12)fields.push(capture);
  const payload=JSON.stringify(fields);
  try{MLCommandPayload.fromWire(payload);if(c.id.length>500)return MLResult.Blocked;}catch{return MLResult.Blocked;}
  if(previous)return previous.payload===payload?MLResult.AlreadyApplied:MLResult.Conflict;
  if(!mlSameReviewContext(c,mlReviewContext(s,this.action,c.sku)))return MLResult.Conflict;
  if([MLAction.Mapping,MLAction.Disconnect].includes(this.action)&&c.account!==l.account.identity)return MLResult.Conflict;
  if(this.action===MLAction.Intent){const m=l.mappings.find(m=>m.sku===c.sku);if(m&&mlDestination(c)!==mlDestination(m))return MLResult.Conflict;}
  if(c.action!==this.action||!c.id||s.revision!==c.revision||!Number.isFinite(Date.parse(date))||!Number.isSafeInteger(s.revision+1))return MLResult.Conflict;
  const candidate=MLLedgerCodec.fromWire(JSON.parse(JSON.stringify(l)));
  if(!this.apply(s,candidate,c,a.actor,date))return MLResult.Blocked;
  candidate.commands.push({id:c.id,payload});s.mercadolibre=candidate;s.revision++;return MLResult.Applied;
 }
 protected event(a:MLAttempt,type:MLEventType,c:MLCommand,actor:string,date:string){a.events.push({id:c.id,type,actor,date});}
 protected fence(l:MLLedger,c:MLCommand,actor:string,date:string){for(const i of l.intents)if(mlStatus(i)!==MLEventType.Superseded)this.event(mlCurrent(i),MLEventType.Superseded,c,actor,date);}
}
export class ConnectMLStep extends MLStep {readonly action=MLAction.Connect;apply(_s:DemoSnapshot,l:MLLedger,c:MLCommand,actor:string,date:string){if(!c.account.trim()||l.account.state===MLAccountState.Unknown)return false;this.fence(l,c,actor,date);l.account={state:MLAccountState.Connected,generation:l.account.generation+1,identity:c.account.trim()};return Number.isSafeInteger(l.account.generation);}}
export class DisconnectMLStep extends MLStep {readonly action=MLAction.Disconnect;apply(_s:DemoSnapshot,l:MLLedger,c:MLCommand,actor:string,date:string){if(l.account.state===MLAccountState.Unknown)return false;this.fence(l,c,actor,date);l.account={...l.account,state:MLAccountState.Disconnected,generation:l.account.generation+1};return Number.isSafeInteger(l.account.generation);}}
export class MapMLStep extends MLStep {readonly action=MLAction.Mapping;apply(s:DemoSnapshot,l:MLLedger,c:MLCommand,actor:string,date:string){if(l.account.state!==MLAccountState.Connected||!s.products.some(p=>p.sku===c.sku)||!c.listing.trim()||l.mappings.some(m=>m.sku!==c.sku&&m.account===l.account.identity&&m.listing===c.listing.trim()&&m.variation===c.variation.trim()))return false;for(const i of l.intents.filter(i=>i.sku===c.sku))this.event(mlCurrent(i),MLEventType.Superseded,c,actor,date);const old=l.mappings.find(m=>m.sku===c.sku),generation=(old?.generation??0)+1;if(!Number.isSafeInteger(generation))return false;l.mappings=l.mappings.filter(m=>m.sku!==c.sku);l.mappings.push({sku:c.sku,state:MLMappingState.Complete,generation,account:l.account.identity,listing:c.listing.trim(),variation:c.variation.trim()});return true;}}
export class StockIntent {readonly type=MLIntentType.Stock;capture(s:DemoSnapshot,c:MLCommand){const p=s.products.find(p=>p.sku===c.sku);return p?InventoryPool.balances(s,p)?.sellable??null:null;}}
export class PriceIntent {readonly type=MLIntentType.Price;capture(_s:DemoSnapshot,c:MLCommand){return this.type.valid(c.value)?c.value:null;}}
export class PublicationIntent {readonly type=MLIntentType.Publication;capture(_s:DemoSnapshot,c:MLCommand){return c.value instanceof MLPublication&&this.type.valid(c.value)?c.value:null;}}
const intents=[new StockIntent(),new PriceIntent(),new PublicationIntent()];
export class CreateMLIntentStep extends MLStep {readonly action=MLAction.Intent;apply(s:DemoSnapshot,l:MLLedger,c:MLCommand,actor:string,date:string){const m=l.mappings.find(m=>m.sku===c.sku),value=intents.find(i=>i.type===c.type)?.capture(s,c);if(l.account.state!==MLAccountState.Connected||!m||m.state!==MLMappingState.Complete||m.account!==l.account.identity||value===null||value===undefined)return false;const i:MLIntent={id:c.id,payload:JSON.stringify([c.sku,c.type.wire,value]),sku:c.sku,mappingGeneration:m.generation,accountGeneration:l.account.generation,destination:mlDestination(m),type:c.type,value,attempts:[{id:c.id,events:[{id:c.id,type:MLEventType.Queued,actor,date}]}]};const known=l.intents.filter(p=>sameScope(p,i)&&p.observed!==undefined).at(-1);if(known)i.observed=known.observed;for(const previous of l.intents.filter(p=>sameScope(p,i)&&mlStatus(p)!==MLEventType.Superseded))this.event(mlCurrent(previous),MLEventType.Superseded,c,actor,date);l.intents.push(i);return true;}}
export class RetryMLIntentStep extends MLStep {readonly action=MLAction.Retry;apply(_s:DemoSnapshot,l:MLLedger,c:MLCommand,actor:string,date:string){const i=l.intents.find(i=>i.id===c.intent);if(!i||!live(l,i)||mlCurrent(i).id!==c.attempt||!mlStatus(i).retryable)return false;this.event(mlCurrent(i),MLEventType.Superseded,c,actor,date);i.attempts.push({id:c.id,events:[{id:c.id,type:MLEventType.Queued,actor,date}]});return true;}}
export class SendMLAttemptStep extends MLStep {readonly action=MLAction.Send;apply(_s:DemoSnapshot,l:MLLedger,c:MLCommand,actor:string,date:string){const i=l.intents.find(i=>i.id===c.intent);if(!i||!live(l,i)||mlCurrent(i).id!==c.attempt||mlStatus(i)!==MLEventType.Queued)return false;this.event(mlCurrent(i),MLEventType.Sent,c,actor,date);return true;}}
export class SimulateMLResultStep extends MLStep {readonly action=MLAction.Outcome;apply(_s:DemoSnapshot,l:MLLedger,c:MLCommand,actor:string,date:string){const i=l.intents.find(i=>i.id===c.intent),a=i?.attempts.find(a=>a.id===c.attempt);if(!i||!a||![MLEventType.Confirmed,MLEventType.Rejected].includes(c.outcome))return false;if(!live(l,i)||mlCurrent(i)!==a||mlStatus(i)===MLEventType.Superseded){this.event(a,MLEventType.Superseded,c,actor,date);return true;}if(![MLEventType.Queued,MLEventType.Sent].includes(mlStatus(i)))return false;this.event(a,c.outcome,c,actor,date);if(c.outcome===MLEventType.Confirmed)i.observed=i.value;return true;}}
export const mlSteps:readonly MLStep[]=[new ConnectMLStep(),new DisconnectMLStep(),new MapMLStep(),new CreateMLIntentStep(),new RetryMLIntentStep(),new SendMLAttemptStep(),new SimulateMLResultStep()];
