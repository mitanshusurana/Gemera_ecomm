import type { Metadata } from 'next';
import './globals.css';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ToastProvider } from '@/components/ui/Toast';

export const metadata: Metadata = {
  title: 'Caratloop ERP — Gems & Jewelry Manufacturing ERP',
  description: 'Precision Crafted. Compliance Ready. Commercial ERP System for Rajasthan Gems & Jewelry Enterprises.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-inter bg-background text-textPrimary antialiased">
        <ErrorBoundary>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
