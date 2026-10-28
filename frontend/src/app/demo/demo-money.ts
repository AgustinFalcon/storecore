/** Shared ARS presentation boundary: never divide a monetary value into a floating decimal. */
export function demoMoney(value:number):string {
  if(!Number.isSafeInteger(value)||value<0)return 'Importe no disponible';
  const cents=value%100,whole=(value-cents)/100;
  const parts=new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',minimumFractionDigits:0,maximumFractionDigits:0}).formatToParts(whole);
  if(cents){for(let index=parts.length-1;index>=0;index--)if(parts[index].type==='integer'){parts[index].value+=','+String(cents).padStart(2,'0');break;}}
  return parts.map(part=>part.value).join('');
}
