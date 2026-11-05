import {Component,inject} from '@angular/core';
import {ActivatedRoute,RouterLink} from '@angular/router';
import {toSignal} from '@angular/core/rxjs-interop';
import {map} from 'rxjs';
import {InventoryReturn} from './inventory-query';
@Component({selector:'sc-inventory-return',imports:[RouterLink],template:'@if(destination();as target){<a data-cta="inventory-return" [routerLink]="target.path" [queryParams]="target.params">← Volver al inventario</a>}'})
export class InventoryReturnComponent {readonly destination=toSignal(inject(ActivatedRoute).queryParamMap.pipe(map(p=>InventoryReturn.fromWire(p.get('inventoryReturn')))),{initialValue:null});}
