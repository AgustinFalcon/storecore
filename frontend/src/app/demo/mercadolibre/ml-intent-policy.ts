import {MLIntentBlock,MLIntentType,MLAccountState,MLMappingState,MLEventType,type MLIntent,type MLLedger} from './ml-types';
export class MLIntentPolicy {
 static unknownReason(l:MLLedger,i:MLIntent){if(l.account.state===MLAccountState.Unknown)return MLIntentBlock.UnknownAccount;if(l.mappings.find(m=>m.sku===i.sku)?.state===MLMappingState.Unknown)return MLIntentBlock.UnknownMapping;if(i.type===MLIntentType.Unknown)return MLIntentBlock.UnknownType;if(i.attempts.some(a=>a.events.some(e=>e.type===MLEventType.Unknown)))return MLIntentBlock.UnknownHistory;return MLIntentBlock.None;}
 static outcomeReason(l:MLLedger,i:MLIntent){const reason=this.unknownReason(l,i);return !reason.permitted?reason:i.attempts.at(-1)!.events.at(-1)!.type.terminal?MLIntentBlock.Terminal:MLIntentBlock.None;}
}
