import { AddressReadState } from './address-read-state';

describe('AddressReadState', () => {
  it.each([AddressReadState.Idle, AddressReadState.Loading, AddressReadState.Ready, AddressReadState.Empty, AddressReadState.Error, AddressReadState.Unknown])('round trips %s', (state) => {
    expect(AddressReadState.fromWire(state.wire)).toBe(state);
    expect(state.confirmed).toBe(state === AddressReadState.Ready || state === AddressReadState.Empty);
    expect(state.usable).toBe(state === AddressReadState.Ready);
  });
  it.each([null, undefined, '', 'future', {}, 1, 'READY'])('rejects %s without preserving raw text', (value) => {
    expect(AddressReadState.fromWire(value)).toBe(AddressReadState.Unknown);
    expect(AddressReadState.fromWire(value).usable).toBe(false);
  });
});
