export interface Material {
  id: string;
  code: string;
  name: string;
  category: 'Gold' | 'Gems' | 'Finished Goods' | 'Consumables';
  uom: string;
  pricePerUnit: number;
}

export interface StockEntry {
  id: string;
  materialId: string;
  quantity: number;
  weight: number;
  value: number;
  location: string;
  status: 'Low' | 'Normal' | 'High';
}

export interface ProductionOrder {
  id: string;
  orderNumber: string;
  date: string;
  status: 'Draft' | 'Released' | 'In Progress' | 'Completed';
  targetQuantity: number;
  completedQuantity: number;
}

export interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  customerName: string;
  totalAmount: number;
  paymentStatus: 'Paid' | 'Pending' | 'Overdue';
}

export interface JournalEntry {
  id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  account: string;
}

export interface GSTRegisterEntry {
  id: string;
  period: string;
  type: 'Output' | 'ITC' | 'RCM';
  amount: number;
  status: 'Matched' | 'Unmatched';
}
