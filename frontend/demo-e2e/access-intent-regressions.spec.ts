import { expect, Page, test } from '@playwright/test';

const intentKey='storecore.demo.intent';
const cta=(page:Page,id:string)=>page.locator(`[data-cta="${id}"]`);
async function enter(page:Page,admin=false){
 await page.getByRole('combobox',{name:'Perfil de muestra',exact:true}).selectOption(admin?'admin@demo.invalid':'cliente@demo.invalid');
 await page.getByLabel('Contraseña',{exact:true}).fill('demo');await cta(page,'login-submit').click();await cta(page,admin?'login-admin':'login-customer').click();
}
async function storedIntentLogin(page:Page,path:string,admin:boolean){
 await page.goto('/demo/login');await page.evaluate(({key,path})=>sessionStorage.setItem(key,path),{key:intentKey,path});await page.reload();await enter(page,admin);
 await expect.poll(()=>page.evaluate(key=>sessionStorage.getItem(key),intentKey)).toBeNull();
}
async function guardedLogin(page:Page,path:string,admin:boolean){
 await page.goto(path);await expect(page.getByRole('heading',{name:'Ingresá para continuar'})).toBeVisible();await cta(page,'access-login').click();
 expect(await page.evaluate(key=>sessionStorage.getItem(key),intentKey)).toBe(path);await page.reload();await enter(page,admin);
 await expect.poll(()=>page.evaluate(key=>sessionStorage.getItem(key),intentKey)).toBeNull();
}

for(const admin of [false,true]){
 test(`cold login preserves public catalog intent for ${admin?'administrator':'customer'}`,async({page})=>{
  await page.goto('/demo/catalog');await expect(page.getByRole('heading',{name:'Catálogo',exact:true})).toBeVisible();await storedIntentLogin(page,'/demo/catalog',admin);await expect(page).toHaveURL(/\/demo\/catalog$/);await expect(page.locator('.product-card')).not.toHaveCount(0);
 });
 for(const id of ['DEMO-100','DEMO-102'])test(`cold administrative order ${id} intent respects ${admin?'administrator':'customer'} authority`,async({page})=>{
  const path='/demo/user/orders/'+id;await guardedLogin(page,path,admin);
  if(admin){await expect(page).toHaveURL(new RegExp(path+'$'));await expect(page.locator('main')).toContainText(id);}
  else{await expect(page).toHaveURL(/\/demo$/);await page.goto(path);await expect(page.getByRole('heading',{name:'Ingresá para continuar'})).toBeVisible();await expect(cta(page,'order-shipment-advance')).toHaveCount(0);await expect(cta(page,'order-receipt')).toHaveCount(0);}
 });
 test(`cold marketplace intent respects ${admin?'administrator':'customer'} authority`,async({page})=>{
  await guardedLogin(page,'/demo/user/mercadolibre',admin);
  if(admin){await expect(page).toHaveURL(/\/demo\/user\/mercadolibre$/);await expect(cta(page,'ml-tab-account')).toBeVisible();}
  else{await expect(page).toHaveURL(/\/demo$/);await page.goto('/demo/user/mercadolibre');await expect(page.getByRole('heading',{name:'Ingresá para continuar'})).toBeVisible();await expect(cta(page,'ml-connect')).toHaveCount(0);}
 });
 test(`unknown or injected cold intents fail closed for ${admin?'administrator':'customer'}`,async({page})=>{
  for(const path of ['/demo/not-a-route','//untrusted.invalid/demo','/demo/user/orders/DEMO-100/extra','/demo/user/mercadolibre?redirect=https://untrusted.invalid']){
   await storedIntentLogin(page,path,admin);await expect(page).toHaveURL(admin?/\/demo\/user\/home$/:/\/demo$/);
  }
 });
}
for(const own of [true,false])test(`cold customer order intent preserves ${own?'own order':'foreign-order isolation'}`,async({page})=>{
 const id=own?'DEMO-100':'DEMO-102';await guardedLogin(page,'/demo/customer/orders/'+id,false);
 if(own){await expect(page).toHaveURL(/\/demo\/customer\/orders\/DEMO-100$/);await expect(page.locator('main')).toContainText('DEMO-100');}
 else{await expect(page).toHaveURL(/\/demo$/);await page.goto('/demo/customer/orders/DEMO-102');await expect(page.getByRole('heading',{name:'Pedido no disponible'})).toBeVisible();await expect(cta(page,'order-receipt')).toHaveCount(0);}
});
