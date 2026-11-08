import { CustomerAccountState } from '../../domain/customer-admin/customer-admin';
import { mapAdminCustomer } from './customer-admin-http.repository';
const valid = { id: 3, firstName: 'Ana', lastName: 'Pérez', email: 'ana@example.invalid', phone: null, state: 'ACTIVE', createdAt: '2026-11-08T12:00:00Z', orderCount: 2, lastOrderAt: null };
describe('customer administration HTTP mapper', () => {
  it('maps purpose-limited valid rows', () => { const row = mapAdminCustomer(valid); expect(row.state).toBe(CustomerAccountState.Active); expect(row.orderCount).toBe(2); });
  it('keeps future finite states unknown and disabled', () => expect(mapAdminCustomer({ ...valid, state: 'REVIEW' }).state).toBe(CustomerAccountState.Unknown));
  it.each([{ ...valid, id: '3' }, { ...valid, orderCount: -1 }, { ...valid, createdAt: 'bad' }, { ...valid, phone: {} }])('rejects malformed rows', (row) => expect(() => mapAdminCustomer(row)).toThrow());
});
