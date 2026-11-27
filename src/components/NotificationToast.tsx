'use client';

import { useEffect } from 'react';
import { AlertCircleIcon, CheckCircleIcon, XIcon } from '@/components/Icons';

export interface NotificationToastProps {
  message: string | null;
  variant?: 'success' | 'error';
  onDismiss: () => void;
  durationMs?: number;
}

/**
 * Non-blocking toast notification that avoids covering mobile auth forms.
 */
export default function NotificationToast({
  message,
  variant = 'success',
  onDismiss,
  durationMs = 4500,
}: NotificationToastProps) {
  useEffect(() => {
    if (!message || durationMs <= 0) return;
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;

  const isError = variant === 'error';

  return (
    <div className="toast-region" aria-live="polite" aria-atomic="true">
      <div
        className={isError ? 'toast toast-error' : 'toast toast-success'}
        role={isError ? 'alert' : 'status'}
      >
        <span className="toast-icon" aria-hidden="true">
          {isError ? <AlertCircleIcon size={18} /> : <CheckCircleIcon size={18} />}
        </span>
        <span className="toast-message">{message}</span>
        <button
          type="button"
          className="toast-close"
          onClick={onDismiss}
          aria-label="Đóng thông báo"
        >
          <XIcon size={15} />
        </button>
      </div>
    </div>
  );
}
