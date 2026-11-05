import {Injectable} from '@angular/core';
@Injectable({providedIn:'root'})
export class DemoBrowserEffects {
 retryRead(){window.location.reload();}
 downloadCsv(csv:string){const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));try{const anchor=document.createElement('a');anchor.href=url;anchor.download='pedidos-demo.csv';anchor.click();}finally{URL.revokeObjectURL(url);}}
}
