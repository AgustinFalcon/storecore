import { expect, Page, test } from '@playwright/test';
const cta=(page:Page,id:string)=>page.locator(`[data-cta="${id}"]`);
async function login(page:Page,admin=false){await page.goto('/demo/login');await page.getByLabel('Contraseña',{exact:true}).fill('demo');await cta(page,'login-submit').click();await cta(page,admin?'login-admin':'login-customer').click();}

test('PDP invalid quantities preserve cart and navigation resets stale presentation',async({page},info)=>{
 await login(page); await page.goto('/demo/catalog/DEMO-001'); await cta(page,'product-add-cart').click(); const before=await page.evaluate(()=>localStorage.getItem('storecore.commercial-demo.v1')); const trace:{input:string;expected:string;cartUnchanged:boolean}[]=[];
 for(const input of ['0','-1','0.5','1.5','']) { await page.getByLabel('Cantidad',{exact:true}).fill(input); await cta(page,'product-add-cart').click(); await expect(page.getByRole('alert')).toContainText('cantidad entera'); await expect(page.locator('.notice.success')).toHaveCount(0); await expect(cta(page,'shell-cart')).toContainText('1'); const unchanged=await page.evaluate(()=>localStorage.getItem('storecore.commercial-demo.v1'))===before; expect(unchanged).toBe(true); trace.push({input,expected:'visible integer >=1 error; no success; cart unchanged',cartUnchanged:unchanged}); }
 await page.getByLabel('Cantidad',{exact:true}).fill('2'); await cta(page,'product-add-cart').click(); await expect(cta(page,'shell-cart')).toContainText('3'); await expect(page.getByRole('alert')).toHaveCount(0); await expect(page.locator('.notice.success')).toContainText('agregado');
 await cta(page,'product-variant').selectOption('with-case'); await cta(page,'related-DEMO-002').click(); await expect(cta(page,'product-variant')).toHaveValue('standard'); await expect(page.getByLabel('Cantidad',{exact:true})).toHaveValue('1'); await cta(page,'product-variant').selectOption('with-case'); await page.getByLabel('Buscar productos',{exact:true}).fill('Guantes'); await cta(page,'shell-search').click(); await cta(page,'product-open-DEMO-007').click(); await expect(cta(page,'product-variant')).toHaveValue('standard'); await expect(cta(page,'product-variant').locator('option')).toHaveCount(1); await cta(page,'product-add-cart').click(); await expect(cta(page,'shell-cart')).toContainText('4'); await cta(page,'product-review-cart').click(); await expect(page.locator('.cart-line').filter({hasText:'DEMO-007'})).toContainText('Estándar'); await expect(page.locator('.cart-line').filter({hasText:'DEMO-007'})).not.toContainText('Con estuche');
 await info.attach('input-validity-state-trace',{body:JSON.stringify({quantity:trace,validAddition:'2 increments existing 1 to 3',sameRouteSkuNavigation:'Case -> Standard, quantity ->1',incompatibleSku:'Only Standard and no Case in persisted cart'},null,2),contentType:'application/json'});
});
for(const width of [390,768,1440]){
 test(`responsive complete surface set ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:width===768?1024:900});
  await page.goto('/demo/login');await expect(page.locator('.auth-card .demo-note')).toBeVisible();
  await page.screenshot({path:info.outputPath('login.png'),fullPage:true});
  await login(page);await page.goto('/demo/catalog/DEMO-001');await cta(page,'product-add-cart').click();
  for(const route of ['catalog','catalog/DEMO-001','cart','checkout','customer/profile','customer/addresses','customer/register','customer/orders','customer/orders/DEMO-100']){
   await page.goto('/demo/'+route);await expect(page.locator('main h1')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath(route.replaceAll('/','-')+'.png'),fullPage:true});
  }
  await login(page,true);
  for(const route of ['catalog','content','offers','promos','orders','orders/DEMO-100','inventory','mercadolibre','capabilities','profile-import']){
   await page.goto('/demo/user/'+route);await expect(page.locator('main h1')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('admin-'+route.replaceAll('/','-')+'.png'),fullPage:true});
  }
 });
}
test('archived cart item blocks checkout and can be removed',async({page})=>{
 await login(page);await page.goto('/demo/catalog/DEMO-001');await cta(page,'product-add-cart').click();await login(page,true);await page.goto('/demo/user/catalog');await cta(page,'admin-product-archive-DEMO-001').click();await cta(page,'operation-confirm').click();
 await login(page);await page.goto('/demo/checkout');await page.getByRole('radio').check();await cta(page,'checkout-step-next').click();await page.getByRole('checkbox').check();await cta(page,'checkout-step-next').click();await cta(page,'checkout-confirm').click();await expect(page.getByRole('alert')).toContainText('archivado');await cta(page,'checkout-edit-cart').click();await cta(page,'cart-remove-DEMO-001').click();await expect(cta(page,'cart-empty-catalog')).toBeVisible();
});
