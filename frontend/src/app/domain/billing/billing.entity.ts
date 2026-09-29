import { DocumentStatus } from '../order/closed-status';

export type TaxCondition = 'CONSUMIDOR_FINAL' | 'MONOTRIBUTO' | 'RESPONSABLE_INSCRIPTO' | 'EXENTO';

export interface BillingProfile {
  readonly legalName: string;
  readonly taxId: string;
  readonly taxCondition: TaxCondition;
  readonly documentStatus: DocumentStatus;
}

export const EMPTY_BILLING: BillingProfile = {
  legalName: '',
  taxId: '',
  taxCondition: 'CONSUMIDOR_FINAL',
  documentStatus: DocumentStatus.NotIssued,
};
