'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastContextType {
  showToast: (type: ToastType, title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (type: ToastType, title: string, description?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastMessage = { id, type, title, description };
    setToasts((prev) => [...prev, newToast]);

    setTimeout(() => {
      removeToast(id);
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-2xl border backdrop-blur-md transition-all transform translate-y-0 animate-in fade-in slide-in-from-bottom-2 duration-200 ${
              toast.type === 'success'
                ? 'bg-surface border-emerald-500/40 text-emerald-700'
                : toast.type === 'error'
                ? 'bg-surface border-rose-500/40 text-rose-700'
                : toast.type === 'warning'
                ? 'bg-surface border-amber-500/40 text-amber-700'
                : 'bg-surface border-primary/40 text-primary'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-700" />}
              {toast.type === 'error' && <XCircle className="w-5 h-5 text-rose-700" />}
              {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-700" />}
              {toast.type === 'info' && <Info className="w-5 h-5 text-primary" />}
            </div>

            <div className="flex-1 space-y-1">
              <p className="text-sm font-semibold text-textPrimary">{toast.title}</p>
              {toast.description && <p className="text-xs text-gray-500">{toast.description}</p>}
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="text-gray-500 hover:text-textPrimary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
