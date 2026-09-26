import axios from 'axios';

const API_URL = '/api/v1';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const apiClient = api;

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('caratloop_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('caratloop_token');
        localStorage.removeItem('caratloop_user');
        // Login lives at the app root; '/login' does not exist and 404s.
        window.location.href = '/';
      }
    }
    console.error('API Error:', error.response?.data?.message || error.message);
    return Promise.reject(error);
  }
);

// Party Master APIs
export const partiesApi = {
  list: (params?: { q?: string; type?: string; limit?: number }) => apiClient.get('/parties', { params }),
  getById: (id: string) => apiClient.get(`/parties/${id}`),
  create: (data: any) => apiClient.post('/parties', data),
  update: (id: string, data: any) => apiClient.patch(`/parties/${id}`, data),
  fetchByGstin: (gstin: string) => apiClient.get(`/parties/gstin/${gstin}`),
};

// Ledger APIs  
export const ledgerApi = {
  getPartyLedger: (partyId: string, params: any) => apiClient.get(`/ledger/party/${partyId}`, { params }),
  getReceivables: (params: any) => apiClient.get('/ledger/outstanding/receivables', { params }),
  getPayables: (params: any) => apiClient.get('/ledger/outstanding/payables', { params }),
  getAgeWise: (params: any) => apiClient.get('/ledger/outstanding/age-wise', { params }),
};

// Voucher APIs
export const vouchersApi = {
  createReceipt: (data: any) => apiClient.post('/vouchers/receipt', data),
  createPayment: (data: any) => apiClient.post('/vouchers/payment', data),
  createContra: (data: any) => apiClient.post('/vouchers/contra', data),
  createJournal: (data: any) => apiClient.post('/vouchers/journal', data),
  createCreditNote: (data: any) => apiClient.post('/vouchers/credit-note', data),
  createDebitNote: (data: any) => apiClient.post('/vouchers/debit-note', data),
  list: (params: any) => apiClient.get('/vouchers', { params }),
};

// Banking APIs
export const bankingApi = {
  getAccounts: () => apiClient.get('/banking/accounts'),
  importStatement: (formData: FormData) => apiClient.post('/banking/statement/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getReconciliation: (params: any) => apiClient.get('/banking/reconciliation', { params }),
  matchEntries: (data: any) => apiClient.post('/banking/reconciliation/match', data),
  unmatchEntries: (data: { match_id?: string; bank_entry_id?: string }) => apiClient.post('/banking/reconciliation/unmatch', data),
  getBrsReport: (params: any) => apiClient.get('/banking/reconciliation/report', { params }),
};

// Fiscal years: period lock and year-end closing (owner/admin for mutations)
export interface FiscalYear {
  id: string;
  year_label: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_locked: boolean;
  is_closed: boolean;
  locked_at: string | null;
  locked_by_name: string | null;
  closed_at: string | null;
  closed_by_name: string | null;
  closing_journal_entry_id: number | null;
  opening_journal_entry_id: number | null;
  entry_count: number;
}

export interface ClosingPreviewAccount {
  id: string;
  code: string;
  name: string;
  nature: string;
  debits: string | number;
  credits: string | number;
  balance: string | number;
}

export interface ClosingPreview {
  fiscal_year: { id: string; year_label: string; start_date: string; end_date: string; is_locked: boolean; is_closed: boolean };
  income_accounts: ClosingPreviewAccount[];
  expense_accounts: ClosingPreviewAccount[];
  total_income: string | number;
  total_expenses: string | number;
  net_profit: string | number;
  retained_earnings: { id: string; code: string; name: string; balance_before: string | number; balance_after: string | number };
  carried_forward: { id: string; code: string; name: string; nature: string; balance_dr: string | number }[];
  opening_difference: string | number;
  next_year: { start_date: string; end_date: string; year_label: string; exists: boolean; id: string | null };
}

export const fiscalYearsApi = {
  list: () => apiClient.get<{ fiscal_years: FiscalYear[] }>('/fiscal-years'),
  create: (data: { year_label: string; start_date: string; end_date: string; reason?: string }) =>
    apiClient.post('/fiscal-years', data),
  activate: (id: string) => apiClient.post(`/fiscal-years/${id}/activate`, { reason: 'Fiscal year activated' }),
  lock: (id: string) => apiClient.post(`/fiscal-years/${id}/lock`, { reason: 'Fiscal year locked' }),
  unlock: (id: string) => apiClient.post(`/fiscal-years/${id}/unlock`, { reason: 'Fiscal year unlocked' }),
  closingPreview: (id: string) => apiClient.get<ClosingPreview>(`/fiscal-years/${id}/closing-preview`),
  close: (id: string) => apiClient.post(`/fiscal-years/${id}/close`, { reason: 'Year-end closing' }),
};

// GSTR-2B import and reconciliation against the ITC register
export const gstr2bApi = {
  import: (file: File, period?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    if (period) fd.append('period', period);
    return apiClient.post('/gst/gstr2b/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  reconcile: (period: string) => apiClient.post(`/gst/gstr2b/reconcile?period=${encodeURIComponent(period)}`),
  summary: (period: string) => apiClient.get('/gst/gstr2b/summary', { params: { period } }),
};

// Books APIs
export const booksApi = {
  getDayBook: (params: any) => apiClient.get('/books/daybook', { params }),
  getCashBook: (params: any) => apiClient.get('/books/cashbook', { params }),
  getBankBook: (params: any) => apiClient.get('/books/bankbook', { params }),
};

// Purchase APIs
export const purchasesApi = {
  list: (params?: any) => apiClient.get('/purchases/invoices', { params }),
  create: (data: any) => apiClient.post('/purchases/invoices', data),
  getById: (id: string) => apiClient.get(`/purchases/invoices/${id}`),
};

// GST Export APIs
export const gstExportApi = {
  gstr1Json: (period: string) => apiClient.get('/gst/export/gstr1-json', { params: { period }, responseType: 'blob' }),
  gstr3bJson: (period: string) => apiClient.get('/gst/export/gstr3b-json', { params: { period }, responseType: 'blob' }),
  gstr1Excel: (period: string) => apiClient.get('/gst/export/gstr1-excel', { params: { period }, responseType: 'blob' }),
  hsnSummary: (period: string) => apiClient.get('/gst/export/hsn-summary', { params: { period } }),
};

// Inventory item search
export const itemsApi = {
  search: (q: string) => apiClient.get('/inventory/items/search', { params: { q, limit: 20 } }),
  getById: (id: string) => apiClient.get(`/inventory/items/${id}`),
  create: (data: any) => apiClient.post('/inventory/items', data),
};

// e-Invoice (IRN) and e-Way Bill through the configured GSP. All under /gst.
export interface EwayBillPayload {
  transporter_id?: string;
  transporter_name?: string;
  transport_mode: '1' | '2' | '3' | '4';
  vehicle_no?: string;
  vehicle_type?: 'R' | 'O';
  distance_km: number;
  document_no?: string;
  document_date?: string; // DD/MM/YYYY
}
export const einvoiceApi = {
  // Stored IRN details plus the payload preview and validation errors.
  get: (invoiceId: string) => apiClient.get(`/gst/einvoice/${invoiceId}`),
  generate: (invoiceId: string) => apiClient.post(`/gst/einvoice/${invoiceId}/generate`),
  cancel: (invoiceId: string, data: { reason_code: string; remarks: string }) =>
    apiClient.post(`/gst/einvoice/${invoiceId}/cancel`, data),
  generateEwayBill: (invoiceId: string, data: EwayBillPayload) => apiClient.post(`/gst/eway-bill/${invoiceId}`, data),
  cancelEwayBill: (invoiceId: string, data: { reason_code: string; remarks?: string }) =>
    apiClient.post(`/gst/eway-bill/${invoiceId}/cancel`, data),
};

// TDS s.194Q / TCS s.206C(1H) register (Form 26Q / 27EQ feed)
export const tdsTcsApi = {
  register: (params: { kind?: string; from?: string; to?: string }) =>
    apiClient.get('/reports/tds-tcs-register', { params }),
};

// Approval memos (jangad): goods out on approval, returned or invoiced later
export const approvalMemosApi = {
  list: (params?: { status?: string; party_id?: string; overdue?: boolean; limit?: number; offset?: number }) =>
    apiClient.get('/approval-memos', { params }),
  aging: (params?: { as_of?: string }) => apiClient.get('/approval-memos/aging', { params }),
  getById: (id: string) => apiClient.get(`/approval-memos/${id}`),
  create: (data: any) => apiClient.post('/approval-memos', data),
  returnGoods: (id: string, data: any) => apiClient.post(`/approval-memos/${id}/return`, data),
  convert: (id: string, data: any) => apiClient.post(`/approval-memos/${id}/convert`, data),
  cancel: (id: string, data: any) => apiClient.post(`/approval-memos/${id}/cancel`, data),
};

// Users (owner/admin) and the signed-in user's own password
export interface ErpUser {
  id: string;
  company_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  department: string | null;
  employee_code: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string | null;
}

export interface CreateUserPayload {
  full_name: string;
  email: string;
  phone?: string | null;
  role: string;
  department?: string | null;
  employee_code?: string | null;
  password: string;
}

export interface UpdateUserPayload {
  full_name?: string;
  phone?: string | null;
  role?: string;
  department?: string | null;
  employee_code?: string | null;
  is_active?: boolean;
}

export const usersApi = {
  list: () => apiClient.get<{ data: ErpUser[] }>('/users'),
  create: (data: CreateUserPayload) => apiClient.post<ErpUser>('/users', data),
  update: (id: string, data: UpdateUserPayload) => apiClient.patch<ErpUser>(`/users/${id}`, data),
  resetPassword: (id: string, new_password: string) =>
    apiClient.post(`/users/${id}/reset-password`, { new_password }),
};

export const authApi = {
  me: () => apiClient.get('/auth/me'),
  changePassword: (current_password: string, new_password: string) =>
    apiClient.post('/auth/change-password', { current_password, new_password }),
};

export default api;

// Loose gemstone lots and parcels (carats move through the stock ledger)
export interface LotRow {
  id: string;
  lot_no: string | null;
  material_id: string;
  material_code: string;
  material_name: string;
  material_category?: string | null;
  uom?: string | null;
  carat_weight: string | number;
  balance_carats: string | number;
  piece_count: number | null;
  sieve_size: string | null;
  shape: string | null;
  colour: string | null;
  clarity: string | null;
  origin: string | null;
  treatment: string | null;
  cost_per_carat: string | number | null;
  parent_lot_id: string | null;
  parent_lot_no?: string | null;
  merged_into_lot_id: string | null;
  status: 'Open' | 'Split' | 'Merged' | 'Sold' | 'Closed';
  location_id: string | null;
  location_code?: string | null;
  location_name?: string | null;
  certificate_no?: string | null;
  children_count: number;
  created_at?: string;
}

export const lotsApi = {
  list: (params?: { material_id?: string; status?: string; parent_lot_id?: string; q?: string; open_only?: boolean; limit?: number; offset?: number }) =>
    apiClient.get<{ lots: LotRow[] }>('/lots', { params }),
  getById: (id: string) => apiClient.get(`/lots/${id}`),
  create: (data: any) => apiClient.post('/lots', data),
  split: (id: string, data: { children: any[]; reason?: string }) => apiClient.post(`/lots/${id}/split`, data),
  merge: (data: { lot_ids: string[]; lot_no?: string; reason?: string }) => apiClient.post('/lots/merge', data),
  adjust: (id: string, data: { carat_weight: number | string; reason: string }) => apiClient.post(`/lots/${id}/adjust`, data),
};

// Stock locations, per-location balances and transfers between them
export interface StockLocation {
  id: string;
  code: string;
  name: string;
  location_type: string;
  address: string | null;
  is_active: boolean;
  is_default: boolean;
  materials_moved?: number;
  stock_value?: string | number;
}

export const locationsApi = {
  list: (include_inactive = false) =>
    apiClient.get<{ locations: StockLocation[]; location_types: string[] }>('/stock-locations', { params: { include_inactive } }),
  create: (data: any) => apiClient.post('/stock-locations', data),
  update: (id: string, data: any) => apiClient.patch(`/stock-locations/${id}`, data),
  balances: (params?: { location_id?: string; material_id?: string; as_of_date?: string; include_zero?: boolean }) =>
    apiClient.get('/stock-locations/balances', { params }),
  transfers: (params?: { from_date?: string; to_date?: string; location_id?: string; limit?: number; offset?: number }) =>
    apiClient.get('/stock-locations/transfers', { params }),
  getTransfer: (transferNo: string) => apiClient.get(`/stock-locations/transfers/${transferNo}`),
  transfer: (data: any) => apiClient.post('/stock-locations/transfers', data),
};

// Job work (karigar challans, receipts, ITC-04, deemed supply) — CGST s.143
export const jobWorkApi = {
  listChallans: (params?: { status?: string; job_worker_id?: string; limit?: number; offset?: number }) =>
    apiClient.get('/job-work/challans', { params }),
  getChallan: (id: string) => apiClient.get(`/job-work/challans/${id}`),
  createChallan: (data: any) => apiClient.post('/job-work/challans', data),
  receive: (id: string, data: any) => apiClient.post(`/job-work/challans/${id}/receive`, data),
  deemSupply: (id: string, data: { invoice_date?: string; place_of_supply?: string; reason?: string }) =>
    apiClient.post(`/job-work/challans/${id}/deem-supply`, data),
  overdue: (params?: { as_of?: string }) => apiClient.get('/job-work/overdue', { params }),
  itc04: (params: { from_date: string; to_date: string }) => apiClient.get('/job-work/itc-04', { params }),
  receipts: (params?: { job_worker_id?: string; from_date?: string; to_date?: string; limit?: number; offset?: number }) =>
    apiClient.get('/job-work/receipts', { params }),
  karigarStatement: (partyId: string, params?: { from_date?: string; to_date?: string }) =>
    apiClient.get(`/job-work/karigars/${partyId}/statement`, { params }),
};

// Production: bills of materials and BOM-driven orders
export interface BomLinePayload {
  material_id: string;
  quantity_per_unit: number | string;
  standard_loss_pct?: number | string;
  loss_type?: string | null;
  notes?: string | null;
}
export interface BomPayload {
  name: string;
  output_material_id: string;
  output_quantity?: number | string;
  product_id?: string | null;
  product_type?: string;
  bom_version?: string;
  effective_from?: string | null;
  effective_to?: string | null;
  is_active?: boolean;
  remarks?: string | null;
  lines: BomLinePayload[];
  reason?: string;
}
export const productionApi = {
  listOrders: (params?: { status?: string; month_year?: string; limit?: number; offset?: number }) =>
    apiClient.get('/production/orders', { params }),
  getOrder: (id: string) => apiClient.get(`/production/orders/${id}`),
  createOrder: (data: any) => apiClient.post('/production/orders', data),
  completeOrder: (id: string, data: any) => apiClient.post(`/production/orders/${id}/complete`, data),
  listBoms: (params?: { active_only?: boolean; limit?: number; offset?: number }) =>
    apiClient.get('/production/boms', { params }),
  getBom: (id: string, output_quantity?: number | string) =>
    apiClient.get(`/production/boms/${id}`, { params: output_quantity ? { output_quantity } : undefined }),
  createBom: (data: BomPayload) => apiClient.post('/production/boms', data),
  updateBom: (id: string, data: BomPayload) => apiClient.put(`/production/boms/${id}`, data),
};
