'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { BuildingIcon, CheckIcon, ChevronDownIcon, PlusIcon, TicketIcon } from '@/components/Icons';
import StatusBadge from '@/components/ui/StatusBadge';
import type { BuildingSummary } from '@/types/laundry';

interface BuildingSwitcherProps {
  buildings: BuildingSummary[];
  selectedId: string | null;
  collapsed?: boolean;
  onSelect: (id: string) => void;
  onOpenCreate: () => void;
  onOpenJoin: () => void;
}

export default function BuildingSwitcher({
  buildings,
  selectedId,
  collapsed = false,
  onSelect,
  onOpenCreate,
  onOpenJoin,
}: BuildingSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const selected = buildings.find((b) => b.id === selectedId) ?? null;

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

  return (
    <div className="building-switcher" ref={rootRef}>
      <button
        type="button"
        className="switcher-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((prev) => !prev)}
        title={selected ? `${selected.name} (${selected.role === 'MANAGER' ? 'Quản lý' : 'Cư dân'})` : 'Chọn tòa nhà'}
      >
        <span className="switcher-icon" aria-hidden="true">
          <BuildingIcon size={17} />
        </span>
        {!collapsed && (
          <>
            <span className="switcher-meta">
              <span className="switcher-name">
                {selected ? selected.name : buildings.length === 0 ? 'Chưa có tòa nhà' : 'Chọn tòa nhà'}
              </span>
              {selected && (
                <span className="switcher-role">
                  {selected.role === 'MANAGER' ? 'Quản lý' : 'Cư dân'}
                  {selected.status === 'PENDING' ? ' · Chờ duyệt' : ''}
                </span>
              )}
            </span>
            <ChevronDownIcon size={15} className={open ? 'switcher-chevron open' : 'switcher-chevron'} />
          </>
        )}
      </button>

      {open && (
        <div
          id={menuId}
          className={collapsed ? 'switcher-popover switcher-popover-collapsed' : 'switcher-popover'}
          role="dialog"
          aria-label="Chuyển hoặc thêm tòa nhà"
        >
          <div className="switcher-section-label">Tòa nhà của bạn</div>
          {buildings.length === 0 ? (
            <p className="switcher-empty">Bạn chưa tham gia tòa nhà nào.</p>
          ) : (
            <ul className="switcher-list" role="listbox" aria-label="Danh sách tòa nhà">
              {buildings.map((b) => {
                const isSelected = b.id === selectedId;
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={isSelected ? 'switcher-option active' : 'switcher-option'}
                      onClick={() => {
                        setOpen(false);
                        onSelect(b.id);
                      }}
                    >
                      <span className="switcher-option-text">
                        <strong>{b.name}</strong>
                        <span className="switcher-option-sub">
                          {b.role === 'MANAGER' ? 'Quản lý' : 'Cư dân'}
                          {b.status === 'PENDING' && (
                            <>
                              {' · '}
                              <StatusBadge tone="warning" dot={false}>Chờ duyệt</StatusBadge>
                            </>
                          )}
                        </span>
                      </span>
                      {isSelected && <CheckIcon size={15} className="switcher-check" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="switcher-divider" />
          <div className="switcher-actions">
            <button
              type="button"
              className="switcher-action-btn"
              onClick={() => {
                setOpen(false);
                onOpenCreate();
              }}
            >
              <PlusIcon size={15} />
              <span>Tạo tòa nhà mới</span>
            </button>
            <button
              type="button"
              className="switcher-action-btn"
              onClick={() => {
                setOpen(false);
                onOpenJoin();
              }}
            >
              <TicketIcon size={15} />
              <span>Tham gia bằng mã mời</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
