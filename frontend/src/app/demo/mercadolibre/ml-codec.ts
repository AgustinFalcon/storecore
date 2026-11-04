import {MLCommandPayload} from './ml-command-payload';
import {MLLedgerGraph} from './ml-ledger-graph';
import {MLAccountState,MLMappingState,MLIntentType,MLPublication,MLEventType,type MLLedger} from './ml-types';
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=500;
const generation=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0;
/** Additive boundary: legacy associations are evidence only, never external mappings. */
export class MLLedgerCodec {
 static empty():MLLedger{return {account:{state:MLAccountState.Disconnected,generation:0,identity:''},mappings:[],intents:[],commands:[]};}
 static fromWire(raw:unknown):MLLedger {
  if(raw===undefined)return this.empty();
  if(!raw||typeof raw!=='object')throw Error('Datos Mercado Libre Demo inválidos.');
  const r=raw as MLLedger;
  if(!r.account||!generation(r.account.generation)||typeof r.account.identity!=='string'||r.account.identity.length>500||!Array.isArray(r.mappings)||!Array.isArray(r.intents)||!Array.isArray(r.commands))throw Error('Cuenta Mercado Libre Demo inválida.');
  const mappings=r.mappings.map(m=>{if(!m||!text(m.sku)||!generation(m.generation)||![m.account,m.listing,m.variation].every(v=>typeof v==='string'&&v.length<=500))throw Error('Mapping inválido.');const state=MLMappingState.fromWire(m.state);if(state===MLMappingState.Complete&&(![m.account,m.listing].every(text)||typeof m.variation!=='string'))throw Error('Mapping incompleto.');return {...m,state};});
  const intents=r.intents.map(i=>{const type=MLIntentType.fromWire(i.type),value=type===MLIntentType.Publication?MLPublication.fromWire(i.value):i.value;if(!i||!text(i.id)||!text(i.sku)||!(typeof i.payload==='string'&&i.payload.length<=MLCommandPayload.maxLength)||!(typeof i.destination==='string'&&i.destination.length<=MLCommandPayload.maxLength)||!generation(i.mappingGeneration)||!generation(i.accountGeneration)||!Array.isArray(i.attempts)||!i.attempts.length||type!==MLIntentType.Unknown&&!type.valid(value))throw Error('Intención inválida.');const observed=i.observed===undefined?undefined:type===MLIntentType.Publication?MLPublication.fromWire(i.observed):i.observed;if(observed!==undefined&&type!==MLIntentType.Unknown&&!type.valid(observed))throw Error('Observado inválido.');return {...i,type,value,observed,attempts:i.attempts.map(a=>{if(!a||!text(a.id)||!Array.isArray(a.events)||!a.events.length)throw Error('Intento inválido.');return {...a,events:a.events.map(e=>{if(!e||!text(e.id)||!text(e.actor)||!text(e.date)||!Number.isFinite(Date.parse(e.date)))throw Error('Evento inválido.');return {...e,type:MLEventType.fromWire(e.type)};})};})};});
  if(r.commands.some(c=>!c||!text(c.id)||!(typeof c.payload==='string'&&c.payload.length<=MLCommandPayload.maxLength))||new Set(r.commands.map(c=>c.id)).size!==r.commands.length||new Set(mappings.map(m=>m.sku)).size!==mappings.length||new Set(intents.map(i=>i.id)).size!==intents.length||new Set(intents.flatMap(i=>i.attempts.map(a=>a.id))).size!==intents.flatMap(i=>i.attempts).length)throw Error('Identidad Mercado Libre duplicada.');
  const ledger={account:{...r.account,state:MLAccountState.fromWire(r.account.state)},mappings,intents,commands:r.commands.map(c=>({...c}))};
  const destinations=mappings.filter(m=>m.account.trim()&&m.listing.trim()).map(m=>JSON.stringify([m.account,m.listing,m.variation]));if(new Set(destinations).size!==destinations.length)throw Error('Destino Mercado Libre duplicado.');
  MLLedgerGraph.validate(ledger);return ledger;
 }
}
