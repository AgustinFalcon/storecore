import type { DemoSnapshot } from '../demo-model';
import { ProductCondition,OutletScope } from '../catalog/catalog-types';
import { ItemCondition,CatalogMediaKind,CatalogDetailError,CatalogDetailIssue } from './catalog-details-types';
import { CatalogDetailsPolicy,CatalogDetailsRead,type CatalogMedia } from './catalog-details';
import { CatalogMediaRegistry } from './catalog-media';
export interface CatalogOrderLineFacts {readonly kind:ProductCondition;readonly condition:ItemCondition;readonly warrantyTerms:string;readonly cover:Readonly<CatalogMedia>;readonly imageKind:CatalogMediaKind;readonly outletReference:string|null;readonly outletScope:OutletScope|null;readonly outletNotes:string|null;readonly outletDefects:string|null;}
const wire=(raw:unknown):unknown=>raw!==null&&typeof raw==='object'&&'wire'in raw?raw.wire:raw;
export class CatalogOrderLineCodec {
  static fromWire(raw:unknown):CatalogOrderLineFacts{
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||!['kind','condition','warrantyTerms','cover','imageKind','outletReference','outletScope','outletNotes','outletDefects'].every(key=>Object.prototype.hasOwnProperty.call(raw,key)))throw new CatalogDetailError(CatalogDetailIssue.Outlet);
    const value=raw as CatalogOrderLineFacts;
    if(typeof value.warrantyTerms!=='string'||value.warrantyTerms.length>1200||!value.cover||typeof value.cover!=='object'||typeof value.cover.id!=='string'||!value.cover.id||value.cover.id.length>80||!CatalogMediaRegistry.find(value.cover.assetId)||typeof value.cover.alt!=='string'||!value.cover.alt.trim()||value.cover.alt.length>240||value.outletReference!==null&&(typeof value.outletReference!=='string'||!value.outletReference.trim()||value.outletReference.length>80)||value.outletReference===null&&value.outletScope!==null||value.outletReference!==null&&value.outletScope===null)throw new CatalogDetailError(CatalogDetailIssue.Outlet);
    const kind=ProductCondition.fromWire(wire(value.kind)),imageKind=CatalogMediaKind.fromWire(wire(value.imageKind));
    const notesValid=(value.outletNotes===null||typeof value.outletNotes==='string'&&!!value.outletNotes.trim()&&value.outletNotes.length<=1200)&&(value.outletDefects===null||typeof value.outletDefects==='string'&&!!value.outletDefects.trim()&&value.outletDefects.length<=1200);
    if(!notesValid||kind===ProductCondition.Outlet&&(value.outletReference===null||value.outletNotes===null||value.outletDefects===null||!CatalogMediaRegistry.find(value.cover.assetId)?.specimen)||kind===ProductCondition.Standard&&(value.outletReference!==null||value.outletNotes!==null||value.outletDefects!==null)||imageKind!==CatalogMediaKind.Unknown&&imageKind!==CatalogMediaRegistry.find(value.cover.assetId)!.kind)throw new CatalogDetailError(CatalogDetailIssue.Outlet);
    return Object.freeze({kind,condition:ItemCondition.fromWire(wire(value.condition)),warrantyTerms:value.warrantyTerms,cover:Object.freeze({id:value.cover.id,assetId:value.cover.assetId,alt:value.cover.alt}),imageKind,outletReference:value.outletReference,outletScope:value.outletScope===null?null:OutletScope.fromWire(wire(value.outletScope)),outletNotes:value.outletNotes,outletDefects:value.outletDefects});
  }
}
/** Captures current approved presentation facts once; subsequent catalog edits never touch this object. */
export class CaptureCatalogOrderLineStep {
  execute(snapshot:Pick<DemoSnapshot,'catalogDetails'>,sku:string):CatalogOrderLineFacts{
    const detail=CatalogDetailsRead.detail(snapshot,sku);if(!detail||!CatalogDetailsPolicy.known(detail))throw new CatalogDetailError(CatalogDetailIssue.State);
    const media=detail.media[0],asset=CatalogMediaRegistry.find(media.assetId);if(!asset)throw new CatalogDetailError(CatalogDetailIssue.Media);
    return CatalogOrderLineCodec.fromWire({kind:detail.kind,condition:detail.condition,warrantyTerms:detail.warrantyTerms,cover:{...media},imageKind:asset.kind,outletReference:detail.outlet?.reference??null,outletScope:detail.outlet?.scope??null,outletNotes:detail.outlet?.notes??null,outletDefects:detail.outlet?.defects??null});
  }
}
export class CalculateCatalogOrderTotalStep {
  execute(lines:readonly {unit:number;quantity:number}[],delivery=0):number{let total=delivery;if(!Number.isSafeInteger(total)||total<0)throw new Error('El importe de entrega no es válido.');for(const line of lines){const amount=line.unit*line.quantity;if(!Number.isSafeInteger(line.unit)||line.unit<1||!Number.isSafeInteger(line.quantity)||line.quantity<1||!Number.isSafeInteger(amount)||!Number.isSafeInteger(total+amount))throw new Error('El total supera el rango monetario admitido. Revisá las cantidades.');total+=amount;}return total;}
}
