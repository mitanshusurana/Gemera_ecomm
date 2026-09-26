/**
 * Repair and service jobs (store API: /api/v1/repairs). Mirrors RepairJobDTO,
 * RepairTrackingDTO and RepairRequests.Create on the backend.
 */

export type RepairItemType =
  | 'RING' | 'NECKLACE' | 'EARRINGS' | 'BRACELET' | 'BANGLE' | 'PENDANT' | 'CHAIN' | 'WATCH' | 'OTHER';

export type RepairServiceType =
  | 'RESIZE' | 'POLISH' | 'STONE_RESET' | 'RHODIUM_PLATING' | 'CHAIN_REPAIR' | 'ENGRAVING' | 'CLEANING' | 'OTHER';

export type RepairStatus =
  | 'REQUESTED' | 'RECEIVED' | 'ASSESSED' | 'APPROVED' | 'IN_PROGRESS' | 'READY' | 'DELIVERED' | 'CANCELLED';

export interface RepairJobEvent {
  id: string;
  status: RepairStatus;
  note: string | null;
  actor: string | null;
  visibleToCustomer: boolean;
  createdAt: string;
}

export interface RepairJob {
  id: string;
  jobNumber: string;
  customerName: string;
  phone: string;
  email: string | null;
  itemType: RepairItemType;
  itemDescription: string;
  serviceType: RepairServiceType;
  problemDescription: string | null;
  declaredValue: number | null;
  photoUrls: string[];
  ringSize: string | null;
  targetSize: string | null;
  status: RepairStatus;
  estimateAmount: number | null;
  estimateNote: string | null;
  estimateApprovedAt: string | null;
  promisedDate: string | null;
  finalAmount: number | null;
  paidAmount: number | null;
  paymentMode: string | null;
  /** Rupees still owed (bill, else estimate, less paid); null before an estimate exists. */
  amountDue: number | null;
  /** Service tax invoice, once issued. */
  invoiceNumber: string | null;
  invoiceDate: string | null;
  createdAt: string;
  updatedAt: string;
  events: RepairJobEvent[];
}

/** Public tracking view: narrower than RepairJob on purpose. */
export interface RepairTracking {
  jobNumber: string;
  customerFirstName: string;
  itemType: RepairItemType;
  itemDescription: string;
  serviceType: RepairServiceType;
  status: RepairStatus;
  estimateAmount: number | null;
  estimateNote: string | null;
  estimateApprovedAt: string | null;
  estimateAwaitingApproval: boolean;
  promisedDate: string | null;
  finalAmount: number | null;
  paidAmount: number | null;
  /** Rupees still owed; null before an estimate exists. */
  amountDue: number | null;
  /** True when the amount due can be settled online right now (approved, in progress, ready). */
  canPayOnline: boolean;
  /** Service tax invoice number once issued (delivered or fully paid); null before. */
  invoiceNumber: string | null;
  createdAt: string;
  events: RepairJobEvent[];
}

/** POST /repairs/{jobNumber}/payments/order: the Razorpay order to open checkout with (amount in paise). */
export interface RepairPaymentOrder {
  jobNumber: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  amountInr: number;
  customerName: string;
  email: string | null;
  phone: string;
}

/** POST /repairs/{jobNumber}/payments/verify: what Razorpay's checkout handler returns. */
export interface RepairPaymentVerification {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface RepairRequest {
  customerName?: string;
  phone?: string;
  email?: string;
  itemType: RepairItemType;
  serviceType: RepairServiceType;
  itemDescription: string;
  problemDescription?: string;
  declaredValue?: number | null;
  photoUrls?: string[];
  ringSize?: string;
  targetSize?: string;
}

export const REPAIR_ITEM_TYPES: Array<{ value: RepairItemType; label: string }> = [
  { value: 'RING', label: 'Ring' },
  { value: 'NECKLACE', label: 'Necklace' },
  { value: 'EARRINGS', label: 'Earrings' },
  { value: 'BRACELET', label: 'Bracelet' },
  { value: 'BANGLE', label: 'Bangle' },
  { value: 'PENDANT', label: 'Pendant' },
  { value: 'CHAIN', label: 'Chain' },
  { value: 'WATCH', label: 'Watch' },
  { value: 'OTHER', label: 'Other' },
];

/**
 * Service catalogue. `settingKey` is the global setting that carries the
 * "from" price (rupees); when it is absent the page shows "Quote on assessment".
 */
export interface RepairServiceInfo {
  value: RepairServiceType;
  label: string;
  summary: string;
  detail: string;
  settingKey: string;
  turnaround: string;
}

export const REPAIR_SERVICES: RepairServiceInfo[] = [
  {
    value: 'RESIZE', label: 'Resizing', settingKey: 'repairPriceResize', turnaround: '3 to 5 days',
    summary: 'Rings made smaller or larger by up to two sizes without disturbing the setting.',
    detail: 'The shank is cut, metal is added or removed, then the seam is soldered, filed and polished so it disappears. Eternity bands and tension settings are assessed individually.',
  },
  {
    value: 'POLISH', label: 'Polishing', settingKey: 'repairPricePolish', turnaround: '2 to 3 days',
    summary: 'Removes scratches and brings back the mirror finish.',
    detail: 'Multi-stage buffing on the wheel followed by ultrasonic and steam cleaning. Matte and brushed finishes are re-textured to match the original.',
  },
  {
    value: 'STONE_RESET', label: 'Stone resetting', settingKey: 'repairPriceStoneReset', turnaround: '5 to 7 days',
    summary: 'Loose or lost stones re-seated, prongs re-tipped, missing stones matched.',
    detail: 'Each stone is checked under magnification. Worn prongs are rebuilt; replacement stones are matched for size, colour and cut, and priced separately in the estimate.',
  },
  {
    value: 'RHODIUM_PLATING', label: 'Rhodium plating', settingKey: 'repairPriceRhodium', turnaround: '2 to 3 days',
    summary: 'Restores the bright white finish on white gold.',
    detail: 'The piece is polished, cleaned and electroplated with rhodium. Recommended every 12 to 18 months for daily-worn white gold.',
  },
  {
    value: 'CHAIN_REPAIR', label: 'Chain repair', settingKey: 'repairPriceChainRepair', turnaround: '2 to 4 days',
    summary: 'Broken links, clasps and jump rings mended or replaced.',
    detail: 'Links are laser- or torch-soldered depending on the chain. Clasps are replaced with matching metal and purity.',
  },
  {
    value: 'ENGRAVING', label: 'Engraving', settingKey: 'repairPriceEngraving', turnaround: '1 to 2 days',
    summary: 'Names, dates and short messages inside bands or on pendants.',
    detail: 'Machine or hand engraving in a choice of scripts. Up to 20 characters inside a standard band; longer messages are quoted on request.',
  },
  {
    value: 'CLEANING', label: 'Professional cleaning', settingKey: 'repairPriceCleaning', turnaround: 'Same day',
    summary: 'Ultrasonic and steam cleaning with a prong and clasp check.',
    detail: 'Complimentary for pieces bought from Caratloop. Includes an inspection for loose stones and worn settings.',
  },
  {
    value: 'OTHER', label: 'Something else', settingKey: 'repairPriceOther', turnaround: 'On assessment',
    summary: 'Redesigns, conversions, rethreading, watch straps and anything not listed.',
    detail: 'Describe what you need and our goldsmith will assess the piece and send you an estimate before any work begins.',
  },
];

export const REPAIR_STATUS_LABELS: Record<RepairStatus, string> = {
  REQUESTED: 'Requested',
  RECEIVED: 'Received at store',
  ASSESSED: 'Estimate ready',
  APPROVED: 'Estimate approved',
  IN_PROGRESS: 'In the workshop',
  READY: 'Ready for collection',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

/** Customer-facing progress order (CANCELLED is shown separately). */
export const REPAIR_PROGRESS: RepairStatus[] = ['REQUESTED', 'RECEIVED', 'ASSESSED', 'APPROVED', 'IN_PROGRESS', 'READY', 'DELIVERED'];

export function repairServiceLabel(type: RepairServiceType | string | null | undefined): string {
  return REPAIR_SERVICES.find(s => s.value === type)?.label ?? (type ? String(type).replace(/_/g, ' ') : '');
}

export function repairItemLabel(type: RepairItemType | string | null | undefined): string {
  return REPAIR_ITEM_TYPES.find(i => i.value === type)?.label ?? (type ? String(type) : '');
}

export function repairStatusLabel(status: RepairStatus | string | null | undefined): string {
  return (status && REPAIR_STATUS_LABELS[status as RepairStatus]) || (status ? String(status).replace(/_/g, ' ') : '');
}
