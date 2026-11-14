import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { DeliveryMode } from '../src/app/domain/cart/delivery';

const envelope=(data:unknown)=>({code:200,data,message:null});
const pickup={mode:DeliveryMode.Pickup.wire,label:'Retiro en local',cost:0,currency:'ARS',minDays:0,maxDays:1,requiresAddress:false,configurationVersion:7,destination:'Local Córdoba · Calle Central 42',instructions:'Traé tu confirmación de compra.'};
const local={...pickup,mode:DeliveryMode.LocalDelivery.wire,label:'Entrega local',cost:4500,minDays:2,maxDays:5,requiresAddress:true,destination:null,instructions:null};
for(const width of [390,768,1440]) {
  test(`delivery total and accessible pickup with unavailable addresses at ${width}`,async({page})=>{
    await page.setViewportSize({width,height:1000});
    let checkout:Record<string,unknown>|null=null;
    await page.route('**/api/v1/**',route=>{
      const request=route.request(),path=new URL(request.url()).pathname;
      if(path.endsWith('/internal/me'))return route.fulfill({status:401,json:{}});
      if(path.endsWith('/customer/me'))return route.fulfill({json:envelope({id:'buyer',email:'buyer@example.test',firstName:'Buyer',lastName:'Test',phone:''})});
      if(path.endsWith('/customer/auth/csrf'))return route.fulfill({json:envelope({}),headers:{'X-CSRF-Token':'csrf'}});
      if(path.endsWith('/customer/cart'))return route.fulfill({json:envelope({revision:'a'.repeat(64),currency:'ARS',deliveryOptions:[pickup,local],lines:[{sku:'A',name:'Producto',quantity:2,originalUnitPrice:100,discountAmount:0,effectiveUnitPrice:100,offerRef:null,campaignRef:null}]})});
      if(path.endsWith('/customer/me/addresses'))return route.fulfill({status:503,json:{}});
      if(path.endsWith('/customer/checkout')){
        checkout=request.postDataJSON() as Record<string,unknown>;
        return route.fulfill({json:envelope({orderId:'order-1',paymentStatus:'PENDING',orderStatus:'PENDING_PAYMENT'})});
      }
      return route.fulfill({status:404,json:{}});
    });
    await page.goto('/checkout');
    const pay=page.getByRole('button',{name:'Pagar',exact:true});
    await expect(pay).toBeDisabled();
    await page.getByRole('radio',{name:/Entrega local/}).check();
    await expect(page.locator('.sc-summary')).toContainText('4.700,00');
    await expect(pay).toBeDisabled();
    const choosePickup=page.getByRole('radio',{name:/Retiro en local/});
    await choosePickup.focus();await choosePickup.press('Space');
    await expect(choosePickup).toBeChecked();
    await expect(page.locator('select[name=addressId]')).toHaveCount(0);
    await expect(page.locator('.sc-summary')).toContainText('Local Córdoba');
    await expect(page.locator('.sc-summary')).toContainText('Traé tu confirmación');
    await expect(page.locator('.sc-summary')).toContainText('200,00');
    await expect(pay).toBeEnabled();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    const axe=await new AxeBuilder({page}).analyze();
    expect(axe.violations.filter(value=>value.impact==='serious'||value.impact==='critical')).toEqual([]);
    await pay.click();
    await expect(page).toHaveURL(new RegExp('/checkout/result/order-1$'));
    expect(checkout).toMatchObject({deliveryMode:DeliveryMode.Pickup.wire,deliveryConfigurationVersion:7,currency:'ARS'});
    expect(checkout).not.toHaveProperty('addressId');expect(checkout).not.toHaveProperty('cost');expect(checkout).not.toHaveProperty('total');
  });
}
