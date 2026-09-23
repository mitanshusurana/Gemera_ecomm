import { ReactNode } from 'react';

interface Column {
  header: string;
  accessorKey: string;
  cell?: (item: any) => ReactNode;
}

interface DataTableProps {
  columns: Column[];
  data: any[];
  isLoading?: boolean;
  onRowClick?: (item: any) => void;
}

export default function DataTable({ columns, data, isLoading = false, onRowClick }: DataTableProps) {
  if (isLoading) {
    return (
      <div className="w-full glass rounded-xl overflow-hidden animate-pulse">
        <div className="h-12 bg-surface border-b border-border"></div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 border-b border-border/50 bg-background/50"></div>
        ))}
      </div>
    );
  }

  return (
    <div className="w-full glass rounded-xl overflow-x-auto border border-border">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-textSecondary uppercase bg-surface sticky top-0 z-10 shadow-sm">
          <tr>
            {columns.map((col, index) => (
              <th key={index} className="px-6 py-4 font-semibold tracking-wider">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, rowIndex) => (
            <tr 
              key={rowIndex} 
              onClick={() => onRowClick && onRowClick(item)}
              className={`bg-background hover:bg-white/5 border-b border-border/50 transition-colors last:border-0 ${onRowClick ? 'cursor-pointer' : ''}`}
            >
              {columns.map((col, colIndex) => (
                <td 
                  key={colIndex} 
                  className="px-6 py-4 whitespace-nowrap"
                  onClick={(e) => col.accessorKey === 'actions' && e.stopPropagation()}
                >
                  {col.cell ? col.cell(item) : item[col.accessorKey]}
                </td>
              ))}
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-6 py-8 text-center text-textSecondary">
                No data available
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
