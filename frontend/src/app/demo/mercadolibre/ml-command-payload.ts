import {MLAction,MLIntentType,MLPublication,MLEventType} from './ml-types';
export interface MLReviewedContext {reviewedAccount:string;accountGeneration:number;mappingGeneration:number;reviewedDestination:string;}
/** Identities stay bounded separately from a JSON envelope, including JSON escaping. */
export class MLCommandPayload {
 static readonly maxLength=32768;
 private constructor(readonly action:MLAction,readonly actor:string,readonly sku:string,readonly type:MLIntentType,readonly value:unknown,readonly account:string,readonly listing:string,readonly variation:string,readonly intent:string,readonly attempt:string,readonly outcome:MLEventType,readonly capture:unknown,readonly context:MLReviewedContext|undefined,readonly formatLength:number){}
 static fromWire(raw:unknown){
  if(typeof raw!=='string'||raw.length>this.maxLength)throw Error('Payload Mercado Libre inválido.');
  const v:unknown=JSON.parse(raw);if(!Array.isArray(v)||![11,12,13].includes(v.length)||![1,2,5,6,7,8,9].every(n=>typeof v[n]==='string'&&v[n].length<=500))throw Error('Comando Mercado Libre inválido.');
  const action=MLAction.fromWire(v[0]),type=MLIntentType.fromWire(v[3]),outcome=MLEventType.fromWire(v[10]);
  if(action===MLAction.Unknown||!v[1])throw Error('Acción Mercado Libre no acreditada.');
  const capture=action!==MLAction.Intent?undefined:v.length>=12&&type===MLIntentType.Publication?MLPublication.fromWire(v[11]):v[11];if(v.length>=12&&action===MLAction.Intent&&type!==MLIntentType.Unknown&&!type.valid(capture))throw Error('Captura Mercado Libre inválida.');
  const context=v.length===13?v[12] as MLReviewedContext:undefined;if(v.length===13&&(!context||typeof context.reviewedAccount!=='string'||context.reviewedAccount.length>500||typeof context.reviewedDestination!=='string'||context.reviewedDestination.length>this.maxLength||![context.accountGeneration,context.mappingGeneration].every(n=>Number.isSafeInteger(n)&&n>=0)))throw Error('Contexto Mercado Libre inválido.');
  const normalized=context?{reviewedAccount:context.reviewedAccount,accountGeneration:context.accountGeneration,mappingGeneration:context.mappingGeneration,reviewedDestination:context.reviewedDestination}:undefined;
  return new MLCommandPayload(action,v[1],v[2],type,type===MLIntentType.Publication?MLPublication.fromWire(v[4]):v[4],v[5],v[6],v[7],v[8],v[9],outcome,capture,normalized,v.length);
 }
}
