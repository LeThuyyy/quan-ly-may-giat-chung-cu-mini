'use client';

import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontalIcon } from '@/components/Icons';

export interface DropdownMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}

interface DropdownMenuProps {
  label: string;
  items: DropdownMenuItem[];
  disabled?: boolean;
}

/**
 * Accessible context menu for secondary or destructive row actions.
 */
export default function DropdownMenu({ label, items, disabled = false }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="ui-dropdown" ref={rootRef}>
      <button
        type="button"
        className="ui-icon-btn"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        <MoreHorizontalIcon size={17} />
      </button>

      {open && (
        <div id={menuId} className="ui-dropdown-menu" role="menu" aria-label={label}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={item.danger ? 'ui-dropdown-item ui-dropdown-item-danger' : 'ui-dropdown-item'}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.icon && <span aria-hidden="true">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
