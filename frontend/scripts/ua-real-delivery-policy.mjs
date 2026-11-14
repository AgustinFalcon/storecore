import { randomUUID } from 'node:crypto';

/** Explicit fixture provisioning, only for the runner's disposable loopback DB. */
export async function seedManualFulfillment(baseUrl, origin) {
  if (process.env.PGDATABASE !== 'storecore_ua_e2e' || !['127.0.0.1', 'localhost'].includes(new URL(baseUrl).hostname)) throw new Error('Disposable UA delivery target required');
  let cookie = '', csrf = '';
  const call = async (path, method = 'GET', body) => {
    const response = await fetch(baseUrl + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json',
      ...(cookie ? {Cookie:cookie} : {}), ...(csrf ? {'X-CSRF-Token':csrf} : {}) }, ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
    const issued = response.headers.get('set-cookie');
    if (issued) cookie = issued.split(';')[0];
    csrf = response.headers.get('x-csrf-token') ?? csrf;
    if (!response.ok) throw new Error(`UA delivery fixture failed (${response.status}, ${path})`);
    if (response.status === 204) return null;
    return (await response.json()).data;
  };
  await call('/api/v1/internal/auth/login','POST',{email:'cfe-user-admin@example.test',password:'ua-fixture-password-2026'});
  const module = (await call('/api/v1/user/capabilities')).find(row => row.module === 'MANUAL_FULFILLMENT');
  if (!Number.isSafeInteger(module?.configVersion)) throw new Error('UA manual policy missing');
  const result = await call('/api/v1/user/capabilities/MANUAL_FULFILLMENT/policy','PUT',{
    expectedConfigVersion:module.configVersion,reason:'DISPOSABLE_UA_DELIVERY_FIXTURE',correlationId:randomUUID(),
    pickup:{enabled:true,label:'Retiro fixture',cost:'0.00',minDays:0,maxDays:1,destination:'Local fixture',instructions:'Retiro de prueba'},
    localDelivery:{enabled:true,label:'Entrega fixture',cost:'45.00',minDays:1,maxDays:2},
  });
  await call('/api/v1/user/capabilities/MANUAL_FULFILLMENT/state','POST',{
    state:'ACTIVE',expectedConfigVersion:result.configurationVersion,reason:'DISPOSABLE_UA_DELIVERY_ACTIVATION',
  });
  await call('/api/v1/internal/auth/logout','POST',{});
}
