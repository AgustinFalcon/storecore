import { requestPath } from './request-path';

describe('requestPath', () => {
  it('strips query and hash', () => {
    expect(requestPath('/api/v1/customer/session?next=1#x')).toBe('/api/v1/customer/session');
  });
});
