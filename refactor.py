import os
import re

base_path = 'c:/Users/mht/Desktop/caratloop/erp-frontend/src/app/(dashboard)'

# 1. banking/page.tsx
banking_path = os.path.join(base_path, 'banking/page.tsx')
with open(banking_path, 'r', encoding='utf-8') as f:
    banking_content = f.read()

# Replace imports
new_banking = banking_content.replace(
    "import { useState } from 'react';",
    "import { useState, useEffect } from 'react';\nimport { apiClient } from '@/lib/api-client';"
)

# Replace component body
new_banking = re.sub(
    r"export default function BankingPage\(\) \{\n  const \[activeTab, setActiveTab\] = useState\('Reconciliation'\);",
    """export default function BankingPage() {
  const [activeTab, setActiveTab] = useState('Reconciliation');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('2026-08');
  const [unreconciled, setUnreconciled] = useState<any[]>([]);
  const [statementEntries, setStatementEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const fetchAccounts = async () => {
    try {
      const companyId = localStorage.getItem('company_id');
      const data = await apiClient.get('/api/v1/banking/accounts', { headers: { 'x-company-id': companyId } });
      setAccounts(data || []);
      if (data && data.length > 0) setSelectedAccount(data[0].id);
    } catch (err) {}
  };

  const fetchReconciliation = async () => {
    if (!selectedAccount) return;
    try {
      setLoading(true);
      const companyId = localStorage.getItem('company_id');
      const data = await apiClient.get(`/api/v1/banking/reconciliation?account_id=${selectedAccount}&month=${selectedMonth}`, { headers: { 'x-company-id': companyId } });
      setUnreconciled(data?.books_entries || []);
      setStatementEntries(data?.statement_entries || []);
    } catch (err) {}
    setLoading(false);
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    fetchReconciliation();
  }, [selectedAccount, selectedMonth]);

  const handleImport = async () => {
    if (!file || !selectedAccount) return;
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('account_id', selectedAccount);
      const companyId = localStorage.getItem('company_id');
      await apiClient.post('/api/v1/banking/statement/import', formData, { headers: { 'x-company-id': companyId } });
      fetchReconciliation();
    } catch (err) {}
  };

  const handleMatch = async (bookId: string, statementId: string) => {
    try {
      const companyId = localStorage.getItem('company_id');
      await apiClient.post('/api/v1/banking/reconciliation/match', { book_entry_id: bookId, statement_entry_id: statementId }, { headers: { 'x-company-id': companyId } });
      fetchReconciliation();
    } catch (err) {}
  };

  const downloadReport = async () => {
    try {
      const companyId = localStorage.getItem('company_id');
      const data = await apiClient.get(`/api/v1/banking/reconciliation/report?account_id=${selectedAccount}&month=${selectedMonth}`, { headers: { 'x-company-id': companyId } });
      console.log('Report', data);
    } catch (err) {}
  };
""",
    new_banking
)

# Update selectors
new_banking = re.sub(
    r'<select[^>]*>\s*<option>SBI Current A/c \(xxxx-1234\)</option>\s*<option>HDFC Current A/c \(xxxx-5678\)</option>\s*</select>',
    '''<select className="bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]" value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.bank_name} ({a.account_number.slice(-4)})</option>)}
          </select>''',
    new_banking
)

new_banking = new_banking.replace(
    '''<input type="month" className="bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]" defaultValue="2026-08" />''',
    '''<input type="month" className="bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />'''
)

# Update file import button
new_banking = re.sub(
    r'<button className="flex items-center gap-2 px-4 py-2 bg-primary/20 text-primary border border-primary/50 rounded-lg hover:bg-primary/30 transition-colors">\s*<FileUp className="w-4 h-4" />\s*Import SBI Statement\s*</button>',
    '''<div className="flex items-center gap-2">
          <input type="file" className="text-sm text-textSecondary" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button onClick={handleImport} className="flex items-center gap-2 px-4 py-2 bg-primary/20 text-primary border border-primary/50 rounded-lg hover:bg-primary/30 transition-colors">
            <FileUp className="w-4 h-4" />
            Import
          </button>
        </div>''',
    new_banking
)

# Update Unreconciled Books Entries
new_banking = re.sub(
    r'\{\[\s*\{ date: \'01-Aug\'.*?\]\.map\(\(row, i\) => \(',
    '''{loading ? (<tr><td colSpan={5} className="py-12 text-center text-textSecondary">Loading...</td></tr>) : unreconciled.length === 0 ? (<tr><td colSpan={5} className="py-12 text-center text-textSecondary">No unreconciled entries found</td></tr>) : unreconciled.map((row, i) => (''',
    new_banking,
    flags=re.DOTALL
)

# Update Bank Statement Entries
new_banking = re.sub(
    r'\{\[\s*\{ date: \'02-Aug\'.*?\]\.map\(\(row, i\) => \(',
    '''{loading ? (<tr><td colSpan={4} className="py-12 text-center text-textSecondary">Loading...</td></tr>) : statementEntries.length === 0 ? (<tr><td colSpan={4} className="py-12 text-center text-textSecondary">No statement entries found</td></tr>) : statementEntries.map((row, i) => (''',
    new_banking,
    flags=re.DOTALL
)

new_banking = new_banking.replace(
    '''<button className="px-6 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90">
          View BRS Report
        </button>''',
    '''<button onClick={downloadReport} className="px-6 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90">
          View BRS Report
        </button>'''
)

with open(banking_path, 'w', encoding='utf-8') as f:
    f.write(new_banking)


# 2. books/page.tsx
books_path = os.path.join(base_path, 'books/page.tsx')
with open(books_path, 'r', encoding='utf-8') as f:
    books_content = f.read()

new_books = books_content.replace(
    "import { useState } from 'react';",
    "import { useState, useEffect } from 'react';\nimport { apiClient } from '@/lib/api-client';"
)

new_books = re.sub(
    r"export default function BooksPage\(\) \{\n  const \[activeTab, setActiveTab\] = useState\('Day Book'\);",
    """export default function BooksPage() {
  const [activeTab, setActiveTab] = useState('Day Book');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  
  // States for Day Book
  const [dayBookDate, setDayBookDate] = useState('2026-08-02');
  
  // States for Cash/Bank Book
  const [fromDate, setFromDate] = useState('2026-08-01');
  const [toDate, setToDate] = useState('2026-08-31');
  const [selectedAccount, setSelectedAccount] = useState('');

  const fetchAccounts = async () => {
    try {
      const companyId = localStorage.getItem('company_id');
      const res = await apiClient.get('/api/v1/banking/accounts', { headers: { 'x-company-id': companyId } });
      setAccounts(res || []);
      if (res && res.length > 0) setSelectedAccount(res[0].id);
    } catch (err) {}
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const companyId = localStorage.getItem('company_id');
      if (activeTab === 'Day Book') {
        const res = await apiClient.get(`/api/v1/books/daybook?date=${dayBookDate}`, { headers: { 'x-company-id': companyId } });
        setData(res || []);
      } else if (activeTab === 'Cash Book') {
        const res = await apiClient.get(`/api/v1/books/cashbook?from_date=${fromDate}&to_date=${toDate}`, { headers: { 'x-company-id': companyId } });
        setData(res || []);
      } else if (activeTab === 'Bank Book') {
        if (!selectedAccount) return;
        const res = await apiClient.get(`/api/v1/books/bankbook?account_id=${selectedAccount}&from_date=${fromDate}&to_date=${toDate}`, { headers: { 'x-company-id': companyId } });
        setData(res || []);
      }
    } catch (err) {}
    setLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'Bank Book') fetchAccounts();
  }, [activeTab]);

  useEffect(() => {
    fetchData();
  }, [activeTab, dayBookDate, fromDate, toDate, selectedAccount]);
""",
    new_books
)

new_books = re.sub(
    r'<span className="px-4 text-sm font-medium text-white border-x border-border">02 Aug 2026</span>',
    '''<input type="date" value={dayBookDate} onChange={(e) => setDayBookDate(e.target.value)} className="bg-background border-x border-border px-2 py-1 text-sm text-white" />''',
    new_books
)

# Fix date inputs for Cash Book and Bank Book
new_books = new_books.replace(
    '''<input type="date" className="bg-background border border-border rounded-md px-2 py-1.5 text-white text-sm" defaultValue="2026-08-01" />\n              <span className="text-textSecondary">to</span>\n              <input type="date" className="bg-background border border-border rounded-md px-2 py-1.5 text-white text-sm" defaultValue="2026-08-31" />''',
    '''<input type="date" className="bg-background border border-border rounded-md px-2 py-1.5 text-white text-sm" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              <span className="text-textSecondary">to</span>
              <input type="date" className="bg-background border border-border rounded-md px-2 py-1.5 text-white text-sm" value={toDate} onChange={(e) => setToDate(e.target.value)} />'''
)

new_books = re.sub(
    r'<select className="bg-background border border-border rounded-md px-3 py-1\.5 text-white text-sm">\s*<option>SBI Current A/c</option>\s*<option>HDFC Current A/c</option>\s*</select>',
    '''<select className="bg-background border border-border rounded-md px-3 py-1.5 text-white text-sm" value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.bank_name}</option>)}
              </select>''',
    new_books
)

# Day book map
new_books = re.sub(
    r'\{\[\s*\{ vtype: \'Sales\'.*?\]\.map\(\(row, i\) => \(',
    '''{loading ? (<tr><td colSpan={5} className="py-12 text-center text-textSecondary">Loading...</td></tr>) : data.length === 0 ? (<tr><td colSpan={5} className="py-12 text-center text-textSecondary">No entries</td></tr>) : data.map((row, i) => (''',
    new_books,
    flags=re.DOTALL
)

# Cash book map
new_books = re.sub(
    r'\{\[\s*\{ date: \'01-Aug\'.*?\]\.map\(\(row, i\) => \(',
    '''{loading ? (<tr><td colSpan={7} className="py-12 text-center text-textSecondary">Loading...</td></tr>) : data.length === 0 ? (<tr><td colSpan={7} className="py-12 text-center text-textSecondary">No entries</td></tr>) : data.map((row, i) => (''',
    new_books,
    flags=re.DOTALL
)

# Bank Book view map
new_books = new_books.replace(
    '''{activeTab === 'Bank Book' && (
            <div className="text-center py-12 text-textSecondary">
              Bank Book is similar to Cash Book but includes Instrument No and Bank Date columns. Select a bank account to view.
            </div>
          )}''',
    '''{activeTab === 'Bank Book' && (
            <table className="w-full text-left text-sm">
              <thead className="text-textSecondary border-b border-border">
                <tr>
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Particulars</th>
                  <th className="pb-3 font-medium">Voucher Type</th>
                  <th className="pb-3 font-medium">Voucher No</th>
                  <th className="pb-3 font-medium text-right">Receipts (Dr)</th>
                  <th className="pb-3 font-medium text-right">Payments (Cr)</th>
                  <th className="pb-3 font-medium text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (<tr><td colSpan={7} className="py-12 text-center text-textSecondary">Loading...</td></tr>) : data.length === 0 ? (<tr><td colSpan={7} className="py-12 text-center text-textSecondary">No entries</td></tr>) : data.map((row, i) => (
                  <tr key={i} className="hover:bg-white/5">
                    <td className="py-3 text-white">{row.date}</td>
                    <td className="py-3 font-medium text-white">{row.part}</td>
                    <td className="py-3 text-textSecondary">{row.vtype}</td>
                    <td className="py-3 text-primary">{row.vno}</td>
                    <td className="py-3 text-right text-success">{row.dr ? formatCurrency(row.dr) : ''}</td>
                    <td className="py-3 text-right text-danger">{row.cr ? formatCurrency(row.cr) : ''}</td>
                    <td className="py-3 text-right font-medium text-white">{formatCurrency(row.bal)} Dr</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}'''
)

with open(books_path, 'w', encoding='utf-8') as f:
    f.write(new_books)

# 3. purchases/page.tsx
purchases_path = os.path.join(base_path, 'purchases/page.tsx')
with open(purchases_path, 'r', encoding='utf-8') as f:
    purchases_content = f.read()

new_purchases = purchases_content.replace(
    "import { useState } from 'react';",
    "import { useState, useEffect } from 'react';\nimport { apiClient } from '@/lib/api-client';"
)

new_purchases = re.sub(
    r"export default function PurchasesPage\(\) \{\n  const \[isDrawerOpen, setIsDrawerOpen\] = useState\(false\);\n\n  const mockPurchases = \[\n.*?\];",
    """export default function PurchasesPage() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ supplier_id: '', supplier_invoice_no: '', date: '', is_rcm: false, item_id: '', quantity: 1, weight_gm: 0, rate_per_gm: 0, making_charges: 0 });

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const companyId = localStorage.getItem('company_id');
      const data = await apiClient.get('/api/v1/purchases/invoices', { headers: { 'x-company-id': companyId } });
      setInvoices(data || []);
    } catch (err) {}
    setLoading(false);
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const handleSave = async () => {
    try {
      const companyId = localStorage.getItem('company_id');
      await apiClient.post('/api/v1/purchases/invoices', formData, { headers: { 'x-company-id': companyId } });
      setIsDrawerOpen(false);
      fetchInvoices();
    } catch (err) {}
  };""",
    new_purchases,
    flags=re.DOTALL
)

new_purchases = re.sub(
    r'\{mockPurchases\.map\(\(row, i\) => \(',
    '''{loading ? (<tr><td colSpan={9} className="py-12 text-center text-textSecondary">Loading...</td></tr>) : invoices.length === 0 ? (<tr><td colSpan={9} className="py-12 text-center text-textSecondary">No purchases found</td></tr>) : invoices.map((row, i) => (''',
    new_purchases
)

new_purchases = new_purchases.replace(
    '''<PartySelect onChange={() => {}} partyType="Supplier" />''',
    '''<PartySelect onChange={(val) => setFormData({ ...formData, supplier_id: val })} partyType="Supplier" />'''
)

new_purchases = new_purchases.replace(
    '''<input type="text" className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]" placeholder="INV-001" />''',
    '''<input type="text" className="w-full bg-background border border-border rounded-md px-3 py-2 text-white h-[38px]" placeholder="INV-001" onChange={(e) => setFormData({ ...formData, supplier_invoice_no: e.target.value })} />'''
)

new_purchases = new_purchases.replace(
    '''<button className="px-4 py-2 bg-primary text-black rounded-md font-medium hover:bg-primary/90">Save Purchase</button>''',
    '''<button onClick={handleSave} className="px-4 py-2 bg-primary text-black rounded-md font-medium hover:bg-primary/90">Save Purchase</button>'''
)

with open(purchases_path, 'w', encoding='utf-8') as f:
    f.write(new_purchases)

# 4. gst/exports/page.tsx
gst_path = os.path.join(base_path, 'gst/exports/page.tsx')
with open(gst_path, 'r', encoding='utf-8') as f:
    gst_content = f.read()

new_gst = gst_content.replace(
    "import { formatCurrency } from '@/lib/utils';",
    "import { formatCurrency } from '@/lib/utils';\nimport { useState, useEffect } from 'react';\nimport { apiClient } from '@/lib/api-client';"
)

new_gst = re.sub(
    r"export default function GstExportsPage\(\) \{",
    """export default function GstExportsPage() {
  const [period, setPeriod] = useState('2026-07');
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const companyId = localStorage.getItem('company_id');
      const data = await apiClient.get(`/api/v1/gst/tax-register?period=${period}`, { headers: { 'x-company-id': companyId } });
      setSummary(data || []);
    } catch (err) {}
    setLoading(false);
  };

  useEffect(() => {
    fetchSummary();
  }, [period]);

  const handleDownload = async (type: string, ext: string) => {
    try {
      const companyId = localStorage.getItem('company_id');
      const blob = await apiClient.getBlob(`/api/v1/gst/export?type=${type}&period=${period}`, { headers: { 'x-company-id': companyId } });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gst_export_${type}_${period}.${ext}`;
      a.click();
    } catch (err) {}
  };
""",
    new_gst
)

new_gst = new_gst.replace(
    '''<button className="flex-1 flex justify-center items-center gap-2 px-4 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90">
              <Download className="w-4 h-4" />
              Download GSTR-1 JSON
            </button>''',
    '''<button onClick={() => handleDownload('gstr1', 'json')} className="flex-1 flex justify-center items-center gap-2 px-4 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90">
              <Download className="w-4 h-4" />
              Download GSTR-1 JSON
            </button>'''
)

new_gst = new_gst.replace(
    '''<button className="flex-1 flex justify-center items-center gap-2 px-4 py-2 border border-border text-white font-medium rounded-lg hover:bg-white/5">
              <FileSpreadsheet className="w-4 h-4" />
              Download Excel
            </button>''',
    '''<button onClick={() => handleDownload('gstr1_excel', 'xlsx')} className="flex-1 flex justify-center items-center gap-2 px-4 py-2 border border-border text-white font-medium rounded-lg hover:bg-white/5">
              <FileSpreadsheet className="w-4 h-4" />
              Download Excel
            </button>'''
)

new_gst = new_gst.replace(
    '''<button className="w-full flex justify-center items-center gap-2 px-4 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90">
              <Download className="w-4 h-4" />
              Download GSTR-3B JSON
            </button>''',
    '''<button onClick={() => handleDownload('gstr3b', 'json')} className="w-full flex justify-center items-center gap-2 px-4 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary/90">
              <Download className="w-4 h-4" />
              Download GSTR-3B JSON
            </button>'''
)

new_gst = new_gst.replace(
    '''<button className="w-full flex justify-center items-center gap-2 px-4 py-2 border border-border text-white font-medium rounded-lg hover:bg-white/5">
              <Download className="w-4 h-4" />
              Download HSN Summary Excel
            </button>''',
    '''<button onClick={() => handleDownload('hsn', 'xlsx')} className="w-full flex justify-center items-center gap-2 px-4 py-2 border border-border text-white font-medium rounded-lg hover:bg-white/5">
              <Download className="w-4 h-4" />
              Download HSN Summary Excel
            </button>'''
)

new_gst = re.sub(
    r'<tr className="hover:bg-white/5">\s*<td className="py-3 font-medium text-white">Output Tax Liability</td>.*?</tr>',
    '''{loading ? (<tr><td colSpan={5} className="py-12 text-center text-textSecondary">Loading...</td></tr>) : summary.length === 0 ? (<tr><td colSpan={5} className="py-12 text-center text-textSecondary">No data for selected period</td></tr>) : summary.map((row: any, i: number) => (
              <tr key={i} className="hover:bg-white/5">
                <td className="py-3 font-medium text-white">{row.description}</td>
                <td className="py-3 text-right text-white">{formatCurrency(row.cgst)}</td>
                <td className="py-3 text-right text-white">{formatCurrency(row.sgst)}</td>
                <td className="py-3 text-right text-white">{formatCurrency(row.igst)}</td>
                <td className="py-3 text-right text-white font-medium">{formatCurrency(row.total)}</td>
              </tr>
            ))}''',
    new_gst,
    flags=re.DOTALL
)

new_gst = re.sub(r'<tr className="hover:bg-white/5">\s*<td className="py-3 font-medium text-white">Input Tax Credit \(ITC\).*?</tr>', '', new_gst, flags=re.DOTALL)
new_gst = re.sub(r'<tr className="bg-primary/5 font-bold border-t-2 border-primary/20 text-white">\s*<td className="py-3 text-primary">Net Tax Payable.*?</tr>', '', new_gst, flags=re.DOTALL)


with open(gst_path, 'w', encoding='utf-8') as f:
    f.write(new_gst)

print("Done")
