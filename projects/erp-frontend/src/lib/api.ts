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
  getBrsReport: (params: any) => apiClient.get('/banking/reconciliation/report', { params }),
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
