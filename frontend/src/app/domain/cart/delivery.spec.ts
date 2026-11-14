import { DeliveryDecision, DeliveryMode, DeliveryQuote, DeliverySnapshotState, checkoutTotal } from './delivery';
import { ShipmentStatus, ShipmentTransition } from '../order/commerce-states';
import { nextShipment } from '../order/fulfillment-transition';

const pickup = {mode:DeliveryMode.Pickup.wire,label:'Retiro',cost:0,currency:'ARS',minDays:0,maxDays:1,requiresAddress:false,configurationVersion:2,destination:'Local Córdoba',instructions:'Traé la confirmación'};
const local = {...pickup,mode:DeliveryMode.LocalDelivery.wire,label:'Entrega local',cost:4500,requiresAddress:true,destination:null,instructions:null};
describe('delivery decisions',()=>{
  it('translates closed modes and validates the entire quote set without free fallbacks',()=>{
    expect(DeliveryMode.fromWire('future')).toBe(DeliveryMode.Unknown);
    expect(DeliveryMode.fromWire(DeliveryMode.Pickup.wire)).toBe(DeliveryMode.Pickup);
    expect(DeliveryQuote.fromWire(pickup).known).toBe(true);
    expect(DeliveryQuote.fromWire(local).requiresAddress).toBe(true);
    for(const invalid of [{cost:-1},{cost:0.001},{currency:'USD'},{minDays:-1},{maxDays:-1},{requiresAddress:false},{configurationVersion:0},{mode:'future'}]) {
      expect(DeliveryQuote.listFromWire([pickup,{...local,...invalid}])).toEqual([]);
    }
    expect(DeliveryQuote.listFromWire([pickup,pickup])).toEqual([]);
    expect(DeliveryQuote.fromWire({...pickup,destination:''})).toBe(DeliveryQuote.Unknown);
    expect(DeliveryQuote.fromWire({...pickup,instructions:''})).toBe(DeliveryQuote.Unknown);
    expect(DeliveryQuote.listFromWire(undefined)).toEqual([]);
  });
  it('pins every presented fact and sums known decimal amounts as minor units',()=>{
    const quote=DeliveryQuote.fromWire(local);
    expect(quote.same(DeliveryQuote.fromWire(local))).toBe(true);
    expect(quote.same(DeliveryQuote.fromWire({...local,configurationVersion:3}))).toBe(false);
    expect(quote.same(DeliveryQuote.fromWire({...local,cost:5000}))).toBe(false);
    expect(checkoutTotal([{effectiveUnitPrice:0.1,quantity:3}],quote)).toBe(4500.3);
    expect(checkoutTotal([{effectiveUnitPrice:999999999999.99,quantity:1}],quote)).toBeNull();
    expect(checkoutTotal([],DeliveryQuote.Unknown)).toBeNull();
  });
  it('separates known pickup, legacy absence and invalid snapshots',()=>{
    const decision=DeliveryDecision.fromWire({state:DeliverySnapshotState.Known.wire,value:pickup});
    expect(decision.canFulfill).toBe(true);expect(decision.showsTracking).toBe(false);
    expect(decision.quote.destination).toBe(pickup.destination);
    expect(DeliveryDecision.fromWire({state:DeliverySnapshotState.LegacyMissingBlock.wire,value:null}).canFulfill).toBe(true);
    for(const raw of [undefined,{state:'FUTURE',value:pickup},{state:'KNOWN',value:{...pickup,instructions:null}},{state:'LEGACY_MISSING_BLOCK',value:pickup}]) {
      expect(DeliveryDecision.fromWire(raw)).toBe(DeliveryDecision.Unknown);
    }
    const delivery=DeliveryDecision.fromWire({state:'KNOWN',value:{...local,destination:{street:'Calle',number:'1',city:'Córdoba',province:'Córdoba',postalCode:'5000'}}});
    expect(delivery.quote.destination).toContain('Calle 1');
    expect(delivery.showsTracking).toBe(true);
  });
  it('orders pickup and delivery steps independently and blocks crossed transitions',()=>{
    expect(nextShipment(ShipmentStatus.Preparing,DeliveryMode.Pickup)).toBe(ShipmentTransition.ReadyForPickup);
    expect(nextShipment(ShipmentStatus.ReadyForPickup,DeliveryMode.Pickup)).toBe(ShipmentTransition.PickedUp);
    expect(nextShipment(ShipmentStatus.PickedUp,DeliveryMode.Pickup)).toBeNull();
    expect(nextShipment(ShipmentStatus.Shipped,DeliveryMode.Pickup)).toBeNull();
    expect(nextShipment(ShipmentStatus.ReadyForPickup,DeliveryMode.LocalDelivery)).toBeNull();
    expect(nextShipment(ShipmentStatus.Pending,DeliveryMode.Unknown)).toBeNull();
    expect(ShipmentStatus.fromWire(ShipmentStatus.PickedUp.wire)).toBe(ShipmentStatus.PickedUp);
    expect(ShipmentTransition.PickedUp.requiresTracking).toBe(false);
  });
});
