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

export default api;
