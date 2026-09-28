export type TaxCondition = 'CONSUMIDOR_FINAL' | 'MONOTRIBUTO' | 'RESPONSABLE_INSCRIPTO' | 'EXENTO';

export interface BillingProfile {
  readonly legalName: string;
  readonly taxId: string;
  readonly taxCondition: TaxCondition;
  readonly documentStatus: 'NOT_ISSUED' | 'ISSUED';
}

export const EMPTY_BILLING: BillingProfile = {
  legalName: '',
  taxId: '',
  taxCondition: 'CONSUMIDOR_FINAL',
  documentStatus: 'NOT_ISSUED',
};
