import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';
import { DemoCommerce, DemoContext, DemoProductVariant, DemoScenario, decodeSnapshot, demoSeed, type DemoSnapshot } from '../src/app/demo/demo-model';
import { CustomerAccountState } from '../src/app/demo/customers/customer-account';
import { UserRole } from '../src/app/domain/user/user-role';
import { OrderStatus, PaymentStatus, ShipmentStatus } from '../src/app/domain/order/commerce-states';
import { OrderPaymentFilter } from '../src/app/demo/orders/demo-order-history';

const cta=(page:Page,id:string)=>page.locator(`[data-cta="${id}"]`);
export function historyFixture():DemoSnapshot {
  const snapshot=demoSeed(), source=snapshot.orders[0]; snapshot.products.push({...snapshot.products[1],sku:'OLD-SKU',active:false});
  snapshot.orders=[...snapshot.orders.filter(order=>order.actor!=='cliente'),...[
    {id:'Z-old',createdDate:'2026-01-01'}, {id:'A-new',createdDate:'2026-10-28T12:00:00Z'},
    {id:'B-tie',createdDate:'2026-10-28T09:00:00-03:00'}, {id:'C-day',createdDate:'2026-10-01'},
    {id:'D-old',createdDate:'2026-09-01'}, {id:'E-missing',createdDate:undefined}, {id:'F-invalid',createdDate:'2026-02-30'},
  ].map(value=>({...source,...value,request:value.id,lines:[{sku:'DEMO-001',name:'Taladro histórico',quantity:2,unit:10099,variant:DemoProductVariant.Case},{sku:'OLD-SKU',name:'Accesorio histórico retirado',quantity:1,unit:501}],total:20699,incident:'INTERNAL-ONLY-NOTE'}))];
  snapshot.orders.find(order=>order.id==='F-invalid')!.payment=PaymentStatus.Unknown;
  const commerce=new DemoCommerce(snapshot,()=> '2026-10-29T12:00:00Z',()=> 'PENDING-SC13');commerce.add('cliente','DEMO-002',1);commerce.checkout('cliente','pending-SC13','address-cliente',DemoScenario.Pending);
  return decodeSnapshot(JSON.stringify(commerce.snapshot));
}
async function login(page:Page,email='cliente@demo.invalid') {await page.goto('/demo/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill('demo');await cta(page,'login-submit').click();await cta(page,'login-customer').click();}
async function open(page:Page,snapshot=historyFixture(),query='') {decodeSnapshot(JSON.stringify(snapshot));await page.goto('/demo/login');await page.evaluate(raw=>{localStorage.setItem('storecore.commercial-demo.v1',raw);sessionStorage.clear();},JSON.stringify(snapshot));await login(page);await page.goto('/demo/customer/orders'+query);await expect(page.getByRole('heading',{level:1})).toBeFocused();}
async function storage(page:Page) {return page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}));}

test('SC13 chronology, all historical lines, paging and read-only detail return preserve URL and focus',async({page})=>{
  await open(page);const before=await storage(page);
  await expect(page.locator('.history-order h3')).toHaveText(['DEMO-PENDING-SC13','A-new','B-tie','C-day','D-old']);
  await expect(page.locator('.history-order').filter({hasText:'A-new'})).toContainText('100,99');await expect(page.locator('.history-page')).not.toContainText('INTERNAL-ONLY-NOTE');
  await cta(page,'history-next').click();await expect(page.getByRole('heading',{name:'Tus pedidos',exact:true})).toBeFocused();await expect(page.locator('.history-order h3')).toHaveText(['Z-old','E-missing','F-invalid']);await expect(page.locator('.history-order').filter({hasText:'F-invalid'})).toContainText('Fecha no disponible');
  await cta(page,'history-previous').click();await page.getByLabel('Buscar pedido',{exact:true}).fill('OLD-SKU');await expect(page.getByLabel('Buscar pedido',{exact:true})).toBeFocused();await expect(page.getByRole('status').filter({hasText:'7 pedidos encontrados'})).toBeVisible();
  await cta(page,'history-next').click();await cta(page,'order-open-E-missing').focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(/customer\/orders\/E-missing\?q=OLD-SKU&page=2/);await cta(page,'order-list-back').click();await expect(page).toHaveURL(/customer\/orders\?q=OLD-SKU&page=2/);await expect(page.getByRole('heading',{level:1})).toBeFocused();await page.reload();await expect(page.locator('.history-order h3')).toHaveText(['E-missing','F-invalid']);expect(await storage(page)).toEqual(before);
});

test('SC13 complete closed filters, invalid query and no-results are recoverable without writes',async({page})=>{
  await open(page);const before=await storage(page);
  for(const filter of OrderPaymentFilter.all){await page.getByLabel('Estado de pago',{exact:true}).focus();await page.getByLabel('Estado de pago',{exact:true}).selectOption(filter.wire);await expect(page.getByLabel('Estado de pago',{exact:true})).toBeFocused();if(filter===OrderPaymentFilter.Unknown)await expect(page.locator('.history-order h3')).toHaveText(['F-invalid']);}
  await page.goto('/demo/customer/orders?payment=INVENTED&page=-1');await expect(page.getByRole('alert')).toContainText('filtros no reconocidos');await cta(page,'history-clear').click();await expect(page).toHaveURL(/customer\/orders$/);
  await page.getByLabel('Buscar pedido',{exact:true}).fill('sin-coincidencias');await expect(page.getByRole('heading',{name:'No encontramos pedidos con estos filtros'})).toBeVisible();await expect(page.getByRole('heading',{name:'Todavía no tenés pedidos'})).toHaveCount(0);await cta(page,'history-clear').click();await expect(page.locator('.history-order')).toHaveCount(5);expect(await storage(page)).toEqual(before);
});

test('SC13 actor isolation, empty account, guest/USER and corrupt durable data never leak or seed-fallback',async({page})=>{
  const snapshot=historyFixture();snapshot.orders=snapshot.orders.filter(order=>order.actor!=='cliente');for(const product of snapshot.products)product.reserved=0;await open(page,snapshot,'?payment=invalid-empty');await expect(page.getByRole('alert')).toContainText('filtros no reconocidos');await cta(page,'history-clear').click();await expect(page.getByRole('heading',{name:'Todavía no tenés pedidos'})).toBeVisible();await cta(page,'history-empty-catalog').click();
  await open(page);await page.getByLabel('Buscar pedido',{exact:true}).fill('ORD-1015');await expect(page.locator('.history-order')).toHaveCount(0);
  await cta(page,'shell-logout').click();await page.goto('/demo/customer/orders?q=OLD-SKU');await expect(page.locator('.history-order')).toHaveCount(0);await cta(page,'history-login').click();expect(new URL(page.url()).searchParams.get('returnUrl')).toBe('/demo/customer/orders?q=OLD-SKU');
  await page.getByLabel('Contraseña',{exact:true}).fill('demo');await cta(page,'login-submit').click();await cta(page,'login-admin').click();await page.goto('/demo/customer/orders');await expect(page.locator('.history-order')).toHaveCount(0);
  await page.evaluate(()=>localStorage.setItem('storecore.commercial-demo.v1','{invalid'));await page.reload();await expect(page.getByRole('alert')).toBeVisible();await expect(page.locator('.history-order')).toHaveCount(0);expect(await page.evaluate(()=>localStorage.getItem('storecore.commercial-demo.v1'))).toBe('{invalid');
});

test('SC13 terminal, delivered and unknown snapshots remain distinct and never auto-resolve or expose incidents',async({page})=>{
  const snapshot=demoSeed(), source=snapshot.orders[0];
  const cases=[{id:'rejected',payment:PaymentStatus.Rejected,status:OrderStatus.Cancelled,shipment:ShipmentStatus.Cancelled},{id:'cancelled',payment:PaymentStatus.Cancelled,status:OrderStatus.Cancelled,shipment:ShipmentStatus.Cancelled},{id:'delivered',payment:PaymentStatus.Approved,status:OrderStatus.Paid,shipment:ShipmentStatus.Delivered},{id:'refunded',payment:PaymentStatus.Refunded,status:OrderStatus.Refunded,shipment:ShipmentStatus.Delivered},{id:'unknown',payment:PaymentStatus.Unknown,status:OrderStatus.Unknown,shipment:ShipmentStatus.Unknown}];
  snapshot.orders=cases.map(entry=>({...source,...entry,request:entry.id,createdDate:'2026-10-28',incident:'DO-NOT-DISCLOSE'}));await open(page,snapshot);const before=await storage(page);
  for(const entry of cases){const row=page.locator('.history-order').filter({has:page.getByRole('heading',{name:entry.id,exact:true})});await expect(row).toContainText(entry.payment.label);await expect(row).toContainText(entry.shipment.label);await expect(row.getByRole('link')).toHaveCount(1);}
  await expect(page.locator('.history-page')).not.toContainText('DO-NOT-DISCLOSE');await expect(page.locator('.history-warning')).toHaveCount(2);await page.reload();expect(await storage(page)).toEqual(before);
});

test('SC13 both USER roles and revoked or unknown CUSTOMER access cannot read owned history',async({page})=>{
  for(const entry of [{role:UserRole.Admin,cta:'login-admin'},{role:UserRole.Operator,cta:'login-operator'}]){await page.goto('/demo/login');await page.getByLabel('Contraseña',{exact:true}).fill('demo');await cta(page,'login-submit').click();await cta(page,entry.cta).click();await page.goto('/demo/customer/orders');await expect(page.locator('.history-order')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Mis pedidos',exact:true})).toHaveCount(0);}
  for(const access of [CustomerAccountState.Restricted,CustomerAccountState.Unknown]){const snapshot=demoSeed();snapshot.actors.find(actor=>actor.id==='cliente')!.access!.state=access;await page.goto('/demo/login');await page.evaluate(({raw,context})=>{localStorage.setItem('storecore.commercial-demo.v1',raw);sessionStorage.setItem('storecore.demo.context',context);sessionStorage.setItem('storecore.demo.actor','cliente');sessionStorage.setItem('storecore.demo.generation','0');},{raw:JSON.stringify(snapshot),context:DemoContext.Customer.wire});await page.goto('/demo/customer/orders');await expect(page.locator('.history-order')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Ingresá para consultar tus pedidos'})).toBeVisible();}
});

for(const width of [320,390,768,900,1440])test(`SC13 responsive keyboard and Axe ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:900});await open(page);await expect(page.locator('.history-order')).toHaveCount(5);
  await page.getByLabel('Buscar pedido',{exact:true}).focus();await page.keyboard.press('Tab');await expect(page.getByLabel('Estado de pago',{exact:true})).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.screenshot({path:info.outputPath(`history-${width}.png`),fullPage:true});if(width===1440){const before=await page.getByRole('heading',{level:1}).evaluate(el=>parseFloat(getComputedStyle(el).fontSize));await page.locator('.history-page').evaluate(root=>{const elements=[root,...root.querySelectorAll<HTMLElement>('*')];const sizes=elements.map(el=>parseFloat(getComputedStyle(el).fontSize));elements.forEach((el,index)=>(el as HTMLElement).style.fontSize=(sizes[index]*2)+'px');});await expect.poll(()=>page.getByRole('heading',{level:1}).evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBe(before*2);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(cta(page,'history-clear')).toBeVisible();await page.screenshot({path:info.outputPath('history-text-200-percent.png'),fullPage:true});}
});
