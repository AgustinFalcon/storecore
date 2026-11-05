import {expect,Page} from '@playwright/test';
import {CatalogConditionFilter} from '../src/app/demo/catalog/catalog-condition-filter';
import {PasswordDemoField,PasswordDemoPhase} from '../src/app/demo/buyer/password-demo';
import {CartReviewState} from '../src/app/demo/buyer/cart-review';
import {OfferInstant} from '../src/app/demo/offers/offer-clock';
const action=(page:Page,id:string)=>page.locator('[data-cta="'+id+'"]');
/** One natural buyer journey shared by the owning suite and global CTA inventory. */
export async function exerciseBuyerR8Ctas(page:Page):Promise<void>{
 await page.goto('/demo/login');await page.getByLabel('Contraseña',{exact:true}).fill('demo');await action(page,'login-submit').click();await action(page,'login-customer').click();
 await page.goto('/demo/customer/profile');await action(page,'password-review').click();await expect(page.locator('#password-'+PasswordDemoField.Current.id)).toBeFocused();
 for(const field of PasswordDemoField.all)await page.locator('#password-'+field.id).fill('sample-demo-only');
 await action(page,'password-review').click();await expect(page.locator('sc-demo-password')).toContainText(PasswordDemoPhase.Confirming.label);await action(page,'password-confirm').click();await expect(page.locator('sc-demo-password')).toContainText(PasswordDemoPhase.Success.label);
 await page.locator('#password-'+PasswordDemoField.Current.id).fill('discard-demo');await action(page,'password-cancel').click();await expect(page.locator('#password-'+PasswordDemoField.Current.id)).toHaveValue('');
 await page.goto('/demo/catalog');for(const filter of CatalogConditionFilter.all){await action(page,'catalog-condition').selectOption(filter.wire);await expect(action(page,'catalog-condition')).toHaveValue(filter.wire);}
 await action(page,'catalog-condition').selectOption(CatalogConditionFilter.Outlet.wire);await action(page,'catalog-condition-remove').click();await expect(action(page,'catalog-condition')).toHaveValue(CatalogConditionFilter.All.wire);
 await action(page,'product-open-DEMO-001').click();await action(page,'product-help').click();await expect(page.getByRole('dialog')).toContainText('Ayuda de demostración');await action(page,'information-close').click();
 await page.goto('/demo/customer/favorites');for(const sku of ['DEMO-001','DEMO-003'])await action(page,'favorite-add-'+sku).click();
 await page.goto('/demo/cart');await expect(page.locator('.cart-line')).toHaveCount(2);await action(page,'cart-checkout').click();await expect(page).toHaveURL('/demo/checkout');
 const expiredReference=OfferInstant.fromWire('2028-01-01T12:00:00Z');expect(expiredReference.known).toBe(true);
 await page.evaluate(reference=>{const key='storecore.commercial-demo.v1',snapshot=JSON.parse(localStorage.getItem(key)!);snapshot.offerReference=reference;snapshot.revision++;localStorage.setItem(key,JSON.stringify(snapshot));},expiredReference.wire);
 await page.reload();await action(page,'checkout-review-cart').click();await expect(page).toHaveURL('/demo/cart');await expect(page.locator('.cart-line').filter({hasText:'DEMO-001'})).toContainText(CartReviewState.PriceChanged.label);await expect(action(page,'cart-checkout')).toHaveCount(0);
 await action(page,'cart-review-prices').click();await expect(action(page,'cart-checkout')).toBeVisible();await action(page,'cart-checkout').click();await expect(page).toHaveURL('/demo/checkout');await expect(action(page,'checkout-review-cart')).toHaveCount(0);
 await action(page,'checkout-edit-cart').click();await action(page,'cart-condition-DEMO-003').click();await expect(page).toHaveURL('/demo/catalog/DEMO-003');await expect(page.locator('main h1')).toContainText('Kit de');
 await action(page,'product-review-cart').click();await expect(page.locator('.cart-line')).toHaveCount(2);await action(page,'cart-remove-DEMO-003').click();await expect(page.locator('.cart-line').filter({hasText:'DEMO-003'})).toHaveCount(0);await expect(page.locator('.cart-line').filter({hasText:'DEMO-001'})).toHaveCount(1);
 await page.reload();await expect(page.locator('.cart-line')).toHaveCount(1);await expect(page.locator('.cart-line')).toContainText('DEMO-001');

}
