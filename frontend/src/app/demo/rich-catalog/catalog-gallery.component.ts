import { Component,ElementRef,HostListener,afterRenderEffect,effect,input,signal,viewChild } from '@angular/core';
import type { CatalogDetails,CatalogMedia } from './catalog-details';
import { CatalogMediaRegistry } from './catalog-media';
import { trapDemoDialogFocus } from '../demo-dialog-focus';
@Component({selector:'sc-catalog-gallery',templateUrl:'./catalog-gallery.component.html',styleUrls:['../demo.scss','./catalog-gallery.component.scss']})
export class CatalogGalleryComponent {
  readonly details=input.required<CatalogDetails>();readonly name=input.required<string>();readonly selectedId=signal('');readonly zoom=signal(false);private key='';private restore:HTMLElement|null=null;
  readonly allowZoom=input(true);
  private readonly dialog=viewChild<ElementRef<HTMLDialogElement>>('zoomDialog');readonly trap=trapDemoDialogFocus;
  get selected():CatalogMedia{return this.details().media.find(item=>item.id===this.selectedId())??this.details().media[0];}
  asset(media:CatalogMedia){return CatalogMediaRegistry.find(media.assetId)!;}
  select(media:CatalogMedia):void{this.selectedId.set(media.id);}
  open():void{this.restore=document.activeElement instanceof HTMLElement?document.activeElement:null;this.zoom.set(true);}
  close():void{this.dialog()?.nativeElement.close();this.zoom.set(false);if(this.restore?.isConnected)this.restore.focus();}
  @HostListener('document:keydown.escape',['$event']) escape(event:Event):void{if(this.zoom()){event.preventDefault();event.stopImmediatePropagation();this.close();}}
  constructor(){effect(()=>{const key=this.details().sku+':'+this.details().media.map(item=>item.id).join(',');if(this.key!==key){this.key=key;this.selectedId.set(this.details().media[0]?.id??'');this.zoom.set(false);this.restore=null;}});afterRenderEffect(()=>{const dialog=this.dialog()?.nativeElement;if(dialog&&!dialog.open){dialog.showModal();dialog.querySelector<HTMLElement>('button')?.focus();}});}
}
