import os
import re

base_path = 'c:/Users/mht/Desktop/caratloop/erp-frontend/src/app/(dashboard)'

# 1. banking/page.tsx
banking_path = os.path.join(base_path, 'banking/page.tsx')
with open(banking_path, 'r', encoding='utf-8') as f:
    banking_content = f.read()

# Replace api-client with api
banking_content = banking_content.replace(
    "import { apiClient } from '@/lib/api-client';",
    "import { bankingApi } from '@/lib/api';"
)
# Update function bodies to use bankingApi and destructure data
banking_content = re.sub(
    r"const data = await apiClient\.get\('/api/v1/banking/accounts'.*?\);",
    "const { data } = await bankingApi.getAccounts();",
    banking_content
)
banking_content = re.sub(
    r"const data = await apiClient\.get\(`/api/v1/banking/reconciliation\?.*?`.*?\);",
    "const { data } = await bankingApi.getReconciliation({ account_id: selectedAccount, month: selectedMonth });",
    banking_content
)
banking_content = re.sub(
    r"await apiClient\.post\('/api/v1/banking/statement/import'.*?\);",
    "await bankingApi.importStatement(formData);",
    banking_content
)
banking_content = re.sub(
    r"await apiClient\.post\('/api/v1/banking/reconciliation/match'.*?\);",
    "await bankingApi.matchEntries({ book_entry_id: bookId, statement_entry_id: statementId });",
    banking_content
)
banking_content = re.sub(
    r"const data = await apiClient\.get\(`/api/v1/banking/reconciliation/report\?.*?`.*?\);",
    "const { data } = await bankingApi.getBrsReport({ account_id: selectedAccount, month: selectedMonth });",
    banking_content
)
with open(banking_path, 'w', encoding='utf-8') as f:
    f.write(banking_content)


# 2. books/page.tsx
books_path = os.path.join(base_path, 'books/page.tsx')
with open(books_path, 'r', encoding='utf-8') as f:
    books_content = f.read()

books_content = books_content.replace(
    "import { apiClient } from '@/lib/api-client';",
    "import { booksApi, bankingApi } from '@/lib/api';"
)
books_content = re.sub(
    r"const res = await apiClient\.get\('/api/v1/banking/accounts'.*?\);",
    "const res = await bankingApi.getAccounts();",
    books_content
)
books_content = re.sub(
    r"setAccounts\(res \|\| \[\]\);",
    "setAccounts(res.data || []);",
    books_content
)
books_content = re.sub(
    r"if \(res && res\.length > 0\) setSelectedAccount\(res\[0\]\.id\);",
    "if (res.data && res.data.length > 0) setSelectedAccount(res.data[0].id);",
    books_content
)

books_content = re.sub(
    r"const res = await apiClient\.get\(`/api/v1/books/daybook\?.*?`.*?\);",
    "const res = await booksApi.getDayBook({ date: dayBookDate });",
    books_content
)
books_content = re.sub(
    r"const res = await apiClient\.get\(`/api/v1/books/cashbook\?.*?`.*?\);",
    "const res = await booksApi.getCashBook({ from_date: fromDate, to_date: toDate });",
    books_content
)
books_content = re.sub(
    r"const res = await apiClient\.get\(`/api/v1/books/bankbook\?.*?`.*?\);",
    "const res = await booksApi.getBankBook({ account_id: selectedAccount, from_date: fromDate, to_date: toDate });",
    books_content
)
books_content = re.sub(
    r"setData\(res \|\| \[\]\);",
    "setData(res.data || []);",
    books_content
)
with open(books_path, 'w', encoding='utf-8') as f:
    f.write(books_content)

# 3. purchases/page.tsx
purchases_path = os.path.join(base_path, 'purchases/page.tsx')
with open(purchases_path, 'r', encoding='utf-8') as f:
    purchases_content = f.read()

purchases_content = purchases_content.replace(
    "import { apiClient } from '@/lib/api-client';",
    "import { purchasesApi } from '@/lib/api';"
)
purchases_content = re.sub(
    r"const data = await apiClient\.get\('/api/v1/purchases/invoices'.*?\);",
    "const { data } = await purchasesApi.list();",
    purchases_content
)
purchases_content = re.sub(
    r"await apiClient\.post\('/api/v1/purchases/invoices'.*?\);",
    "await purchasesApi.create(formData);",
    purchases_content
)
with open(purchases_path, 'w', encoding='utf-8') as f:
    f.write(purchases_content)


# 4. gst/exports/page.tsx
gst_path = os.path.join(base_path, 'gst/exports/page.tsx')
with open(gst_path, 'r', encoding='utf-8') as f:
    gst_content = f.read()

gst_content = gst_content.replace(
    "import { apiClient } from '@/lib/api-client';",
    "import api, { gstExportApi } from '@/lib/api';"
)
gst_content = re.sub(
    r"const data = await apiClient\.get\(`/api/v1/gst/tax-register\?.*?`.*?\);",
    "const { data } = await api.get(`/gst/tax-register?period=${period}`);",
    gst_content
)
# Fix handleDownload blob downloading
gst_content = re.sub(
    r"const blob = await apiClient\.getBlob\(`/api/v1/gst/export\?type=\$\{type\}&period=\$\{period\}`.*?\);",
    """let res;
      if (type === 'gstr1') res = await gstExportApi.gstr1Json(period);
      else if (type === 'gstr3b') res = await gstExportApi.gstr3bJson(period);
      else if (type === 'gstr1_excel') res = await gstExportApi.gstr1Excel(period);
      else res = await api.get('/gst/export/hsn-summary', { params: { period }, responseType: 'blob' });
      const blob = res.data;""",
    gst_content
)

with open(gst_path, 'w', encoding='utf-8') as f:
    f.write(gst_content)

print("Fixes applied.")
