import { CatalogMediaKind } from './catalog-details-types';
export interface CatalogAsset {id:string;src:string;label:string;kind:CatalogMediaKind;specimen?:string;}
/** Explicit repository asset registry. A URL matching a pattern is not evidence that a file exists. */
export const CATALOG_ASSETS:readonly CatalogAsset[]=[...Array.from({length:12},(_,index)=>{const id='DEMO-'+String(index+1).padStart(3,'0');return{id,src:'/assets/demo/'+id+'.svg',label:'Ilustración de catálogo '+String(index+1),kind:CatalogMediaKind.Illustration};}),
  {id:'DEMO-001-detail',src:'/assets/demo/DEMO-001-detail.svg',label:'Detalle ilustrado del taladro Demo',kind:CatalogMediaKind.Illustration},
  {id:'outlet-drill-main',src:'/assets/demo/outlet/drill-kit-main-simulated.jpg',label:'Equipo completo · imagen simulada',kind:CatalogMediaKind.GeneratedImage,specimen:'drill-outlet-demo'},
  {id:'outlet-drill-case',src:'/assets/demo/outlet/drill-case-detail-simulated.jpg',label:'Imagen simulada: detalle del estuche con abolladura y marcas superficiales',kind:CatalogMediaKind.GeneratedImage,specimen:'drill-outlet-demo'},
  {id:'outlet-drill-body',src:'/assets/demo/outlet/drill-body-detail-simulated.jpg',label:'Imagen simulada: detalle del cuerpo con marcas de uso en la empuñadura',kind:CatalogMediaKind.GeneratedImage,specimen:'drill-outlet-demo'}];
export class CatalogMediaRegistry {
  static find(id:unknown):CatalogAsset|undefined{return typeof id==='string'?CATALOG_ASSETS.find(asset=>asset.id===id):undefined;}
}
