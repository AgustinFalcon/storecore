import type {StoreProfile} from './profile-domain';
import {manifestLooksUnsafe} from '../../domain/user/profile-manifest';

export interface ProfileRouteFields {storeName:string;supportEmail:string;supportPhone:string;}
export interface ProfileRouteDraft {authority:string;baseline:ProfileRouteFields;draft:ProfileRouteFields;manifest:string;}

const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const fields=(value:unknown):ProfileRouteFields|null=>{
  if(!record(value)||typeof value['storeName']!=='string'||typeof value['supportEmail']!=='string'||typeof value['supportPhone']!=='string')return null;
  if(value['storeName'].length>500||value['supportEmail'].length>500||value['supportPhone'].length>500)return null;
  return{storeName:value['storeName'],supportEmail:value['supportEmail'],supportPhone:value['supportPhone']};
};

/** One session-storage boundary for incomplete route drafts; final profile validation remains separate. */
export class ProfileRouteDraftCodec {
  static acceptsManifest(manifest:string):boolean{return !manifestLooksUnsafe(manifest);}
  static encode(authority:string,baseline:StoreProfile,draft:StoreProfile,manifest:string):string{
    if(!this.acceptsManifest(manifest))throw Error('Unsafe route draft manifest');
    return JSON.stringify({authority,baseline:this.pick(baseline),draft:this.pick(draft),manifest});
  }
  static decode(raw:string|null):ProfileRouteDraft|null{
    if(raw===null)return null;
    try{const value=JSON.parse(raw) as unknown;if(!record(value)||typeof value['authority']!=='string'||typeof value['manifest']!=='string'||value['manifest'].length>100000||!this.acceptsManifest(value['manifest']))return null;const baseline=fields(value['baseline']),draft=fields(value['draft']);return baseline&&draft?{authority:value['authority'],baseline,draft,manifest:value['manifest']}:null;}catch{return null;}
  }
  private static pick(profile:StoreProfile):ProfileRouteFields{return{storeName:profile.storeName,supportEmail:profile.supportEmail,supportPhone:profile.supportPhone};}
}
