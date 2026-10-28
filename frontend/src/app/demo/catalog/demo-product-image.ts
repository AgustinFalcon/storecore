import type { DemoProduct } from '../demo-model';
export function demoProductImage(product: DemoProduct): string { return '/assets/demo/'+(/^DEMO-0(0[1-9]|1[0-2])$/.test(product.sku) ? product.sku : 'DEMO-010')+'.svg'; }
