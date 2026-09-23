/**
 * Old gold / silver exchange: the customer hands in metal, the store assays
 * it and issues the value as store credit (a gift card code usable at
 * checkout). Mirrors ExchangeQuoteResponse / ExchangeRequestDTO in the API.
 */

export type ExchangeMetal = 'GOLD' | 'SILVER';

export type ExchangeStatus =
  | 'REQUESTED'
  | 'RECEIVED'
  | 'ASSAYED'
  | 'CREDITED'
  | 'REJECTED'
  | 'CANCELLED';

/** Rule 114B: PAN is mandatory once the value reaches this amount (INR). */
export const EXCHANGE_PAN_THRESHOLD = 200000;

export interface ExchangeQuote {
  metal: ExchangeMetal;
  purity: string;
  purityFraction: number;
  weightGrams: number;
  /** INR per gram of fine (24K / 999) metal. */
  ratePerGramFine: number;
  /** INR per gram at the declared purity. */
  rate: number;
  deductionPct: number;
  estimatedValue: number;
  /** True when the rate is a fallback figure rather than a live market price. */
  indicative: boolean;
  panRequired: boolean;
}

export interface CreateExchangeRequest {
  metal: ExchangeMetal;
  purity: string;
  weightGrams: number;
  customerName?: string;
  email?: string;
  phone?: string;
  pan?: string;
  idProofType?: string;
  idProofNumber?: string;
  state?: string;
  itemDescription?: string;
}

export interface ExchangeEvent {
  status: ExchangeStatus;
  note: string | null;
  actor: string | null;
  at: string;
}

export interface ExchangeRequest {
  id: string;
  requestNumber: string;
  userId: string | null;
  customerName: string;
  email: string | null;
  phone: string | null;
  metal: ExchangeMetal;
  declaredPurity: string;
  declaredPurityFraction: number;
  declaredWeightGrams: number;
  quotedRatePerGram: number;
  quotedDeductionPct: number;
  quotedValue: number;
  quoteIndicative: boolean;
  status: ExchangeStatus;
  assayedPurityFraction: number | null;
  assayedNetWeightGrams: number | null;
  assayedRatePerGram: number | null;
  deductionPct: number | null;
  finalValue: number | null;
  rejectionReason: string | null;
  /** Masked (ABCDE****F) in the customer view. */
  pan: string | null;
  panRequired: boolean;
  idProofType: string | null;
  stateCode: string | null;
  /** Masked (CL-****-****-1234) in the customer view; the full code arrives by e-mail. */
  creditGiftCardCode: string | null;
  erpPurchaseRef: string | null;
  itemDescription: string | null;
  receivedAt: string | null;
  assayedAt: string | null;
  creditedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  events: ExchangeEvent[];
}

export const EXCHANGE_PURITIES: Record<ExchangeMetal, { value: string; label: string }[]> = {
  GOLD: [
    { value: '24K', label: '24K (999)' },
    { value: '22K', label: '22K (916)' },
    { value: '18K', label: '18K (750)' },
    { value: '14K', label: '14K (585)' },
  ],
  SILVER: [
    { value: '999', label: 'Fine silver (999)' },
    { value: '925', label: 'Sterling (925)' },
  ],
};

export function exchangeStatusLabel(status: ExchangeStatus | string): string {
  switch (status) {
    case 'REQUESTED': return 'Requested';
    case 'RECEIVED': return 'Received';
    case 'ASSAYED': return 'Assayed';
    case 'CREDITED': return 'Credit issued';
    case 'REJECTED': return 'Not accepted';
    case 'CANCELLED': return 'Cancelled';
    default: return status;
  }
}

/** Order of the steps on the customer-facing progress strip. */
export const EXCHANGE_STEPS: ExchangeStatus[] = ['REQUESTED', 'RECEIVED', 'ASSAYED', 'CREDITED'];

export function exchangeStepIndex(status: ExchangeStatus | string): number {
  const i = EXCHANGE_STEPS.indexOf(status as ExchangeStatus);
  return i < 0 ? -1 : i;
}

export function isExchangeOpen(status: ExchangeStatus | string): boolean {
  return status !== 'CREDITED' && status !== 'REJECTED' && status !== 'CANCELLED';
}
