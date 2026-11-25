'use client';
import { useCallback, useEffect, useRef } from 'react';

/** Key the owner by account/building. A completed old mutation must never affect a new session. */
export function useScopedActions(onRefresh: () => Promise<void>, onSessionExpired: () => void) {
  const active = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  const callbacks = useRef({ onRefresh, onSessionExpired });
  useEffect(() => { callbacks.current = { onRefresh, onSessionExpired }; }, [onRefresh, onSessionExpired]);
  useEffect(() => {
    active.current = true;
    const pending = controllers.current;
    return () => { active.current = false; for (const controller of pending) controller.abort(); pending.clear(); };
  }, []);
  const scopedFetch = useCallback(async (url: string, init?: RequestInit) => {
    if (!active.current) throw new DOMException('Scope replaced', 'AbortError');
    const controller = new AbortController(); controllers.current.add(controller);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!active.current || controller.signal.aborted) throw new DOMException('Scope replaced', 'AbortError');
      return response;
    } finally { controllers.current.delete(controller); }
  }, []);
  const refresh = useCallback(async () => {
    if (!active.current) throw new DOMException('Scope replaced', 'AbortError');
    await callbacks.current.onRefresh();
    if (!active.current) throw new DOMException('Scope replaced', 'AbortError');
  }, []);
  const sessionExpired = useCallback(() => { if (active.current) callbacks.current.onSessionExpired(); }, []);
  return { scopedFetch, refresh, sessionExpired };
}
