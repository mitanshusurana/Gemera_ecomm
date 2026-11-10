'use client';

import { useEffect, useRef } from 'react';

/** Fired by the header's "+" menu when the target page is already open. */
export const QUICK_CREATE_EVENT = 'caratloop:quick-create';

/**
 * Open a page's "new" form from outside it: on arrival with `?new=1` (the
 * parameter is removed so a refresh does not reopen the form), or when the
 * header's quick-create menu asks while the page is already showing.
 */
export function useQuickCreate(open: () => void): void {
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') === '1') {
      params.delete('new');
      const rest = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
      openRef.current();
    }
    const onAsk = () => openRef.current();
    window.addEventListener(QUICK_CREATE_EVENT, onAsk);
    return () => window.removeEventListener(QUICK_CREATE_EVENT, onAsk);
  }, []);
}
