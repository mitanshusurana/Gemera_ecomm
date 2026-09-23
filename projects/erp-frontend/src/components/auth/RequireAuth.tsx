'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';

/**
 * Client-side session gate for the dashboard.
 *
 * This prevents an unauthenticated browser from rendering ledger, GST and
 * banking screens. It is a usability and exposure control only — the API
 * remains the sole authority on access, and every endpoint must enforce its
 * own authorisation independently.
 */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      setChecked(true);
      return;
    }
    const next = encodeURIComponent(pathname || '/dashboard');
    // The login screen is the app root (src/app/page.tsx), not /login.
    router.replace(`/?next=${next}`);
  }, [router, pathname]);

  if (!checked) {
    return (
      <div
        className="flex h-screen w-full items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <span className="text-sm text-textSecondary">Checking your session…</span>
      </div>
    );
  }

  return <>{children}</>;
}
