import { operatorPriceCells } from './user-catalog.view';

describe('operator price columns', () => {
  it('keeps base, desired, observed and effective apart', () => {
    expect(
      operatorPriceCells({
        base: 100,
        desired: 90,
        observed: 95,
        effective: 80,
        priceVersion: 'v1',
      }).map((cell) => `${cell.kind}:${cell.value}`),
    ).toEqual(['Base:100', 'Desired:90', 'Observed:95', 'Efectivo:80']);
  });

  it('leaves missing desired and observed blank', () => {
    const cells = operatorPriceCells({
      base: 10,
      desired: null,
      observed: null,
      effective: 10,
      priceVersion: '',
    });
    expect(cells.find((cell) => cell.kind === 'Desired')?.value).toBe('—');
    expect(cells.find((cell) => cell.kind === 'Observed')?.value).toBe('—');
    expect(cells.find((cell) => cell.kind === 'Efectivo')?.value).toBe('10');
  });
});
