import { demoMoney } from './demo-money';
describe('exact integer ARS formatting',()=>{
  it('preserves the common whole-peso visual contract',()=>{for(const amount of [0,100,8450000])expect(demoMoney(amount)).toBe(new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',minimumFractionDigits:0,maximumFractionDigits:2}).format(amount/100));});
  it('preserves two exact cents, including MAX_SAFE_INTEGER without rounding',()=>{expect(demoMoney(1)).toContain('0,01');expect(demoMoney(99)).toContain('0,99');expect(demoMoney(150)).toContain('1,50');expect(demoMoney(Number.MAX_SAFE_INTEGER)).toContain('90.071.992.547.409,91');});
  it('does not render negative, unsafe or non-finite amounts as valid money',()=>{for(const amount of [-1,Number.MAX_SAFE_INTEGER+1,NaN,Infinity,0.1])expect(demoMoney(amount)).toBe('Importe no disponible');});
});
