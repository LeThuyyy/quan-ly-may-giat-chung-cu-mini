'use client';

import { ReactNode, useEffect, useEffectEvent, useId, useRef } from 'react';
import { XIcon } from '@/components/Icons';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

// Only the top dialog owns keyboard focus. Keep the scroll lock until all close,
// including when a parent is removed before its child.
const openDialogs: { container: HTMLDivElement; previousFocus: HTMLElement | null }[] = [];
let previousBodyOverflow = '';

function tabbableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(
    'a[href], area[href], input, select, textarea, button, iframe, object, embed, [tabindex], [contenteditable="true"], audio[controls], video[controls], summary',
  )).filter((element) => {
    if (element.tabIndex < 0 || element.matches(':disabled, input[type="hidden"]')) return false;
    if (element.closest('[hidden], [inert]')) return false;
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
      const style = window.getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      if (ancestor === container) break;
    }
    return true;
  }).sort((a, b) => {
    // Positive tabindex values precede ordinary controls in native tab order.
    const aOrder = a.tabIndex > 0 ? a.tabIndex : Infinity;
    const bOrder = b.tabIndex > 0 ? b.tabIndex : Infinity;
    return aOrder - bOrder;
  });
}

function focusFirst(container: HTMLElement) {
  (tabbableElements(container)[0] ?? container).focus();
}

/**
 * Accessible modal dialog with trapped focus, Escape handling, and focus return.
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  // Keep Escape current without restarting focus/scroll management on parent renders.
  const closeOnEscape = useEffectEvent(() => onClose());

  useEffect(() => {
    const container = dialogRef.current;
    if (!open || !container) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let lastFocus: HTMLElement | null = null;
    if (openDialogs.length === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    // Child effects can run before their parent's effect on a shared mount.
    const entry = { container, previousFocus };
    const childIndex = openDialogs.findIndex((dialog) => container.contains(dialog.container));
    openDialogs.splice(childIndex < 0 ? openDialogs.length : childIndex, 0, entry);
    const isTopDialog = () => openDialogs.at(-1) === entry;
    const recoverFocus = () => {
      if (lastFocus?.isConnected && container.contains(lastFocus) && tabbableElements(container).includes(lastFocus)) {
        lastFocus.focus();
      } else {
        focusFirst(container);
      }
    };

    const focusTimer = window.setTimeout(() => {
      if (isTopDialog() && !container.contains(document.activeElement)) focusFirst(container);
    }, 0);

    const onFocusIn = (event: FocusEvent) => {
      if (!isTopDialog()) return;
      if (event.target instanceof HTMLElement && container.contains(event.target)) {
        lastFocus = event.target;
      } else {
        recoverFocus();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeOnEscape();
        return;
      }
      // Also stop keyboard activation if a script tries to target background UI.
      if (event.target instanceof Node && !container.contains(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        recoverFocus();
        return;
      }
      if (event.key !== 'Tab') return;
      const tabbable = tabbableElements(container);
      const first = tabbable[0];
      const last = tabbable.at(-1);
      if (!first || !tabbable.some((element) => element === document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last ?? container : first ?? container).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocusIn, true);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocusIn, true);
      const wasTopDialog = isTopDialog();
      openDialogs.splice(openDialogs.indexOf(entry), 1);
      // If a lower dialog closes first, its child's return target must not keep
      // pointing into that closing dialog (or a soon-detached DOM subtree).
      for (const dialog of openDialogs) {
        if (dialog.previousFocus && container.contains(dialog.previousFocus)) {
          dialog.previousFocus = entry.previousFocus;
        }
      }
      const remainingDialog = openDialogs.at(-1)?.container;
      if (!remainingDialog) document.body.style.overflow = previousBodyOverflow;
      if (wasTopDialog) {
        const restoreTarget = entry.previousFocus;
        if (restoreTarget?.isConnected && (!remainingDialog || remainingDialog.contains(restoreTarget))) {
          restoreTarget.focus();
        } else if (remainingDialog) {
          focusFirst(remainingDialog);
        }
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="ui-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`ui-modal ui-modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        <div className="ui-modal-header">
          <div>
            <h2 id={titleId} className="ui-modal-title">{title}</h2>
            {description && (
              <p id={descId} className="ui-modal-desc">{description}</p>
            )}
          </div>
          <button
            type="button"
            className="ui-icon-btn"
            onClick={onClose}
            aria-label="Đóng hộp thoại"
          >
            <XIcon size={17} />
          </button>
        </div>
        <div className="ui-modal-body">{children}</div>
        {footer && <div className="ui-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
