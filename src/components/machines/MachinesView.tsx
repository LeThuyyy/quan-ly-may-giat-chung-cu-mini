'use client';

import { useState } from 'react';
import Link from 'next/link';
import { QrIcon, WasherIcon, WrenchIcon } from '@/components/Icons';
import type { MachineHoldView } from '@/components/MachineHoldCard';
import MachineQrButton from '@/components/MachineQrButton';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import StatusBadge from '@/components/ui/StatusBadge';
import type { AppView, MachineView } from '@/types/laundry';

interface MachinesViewProps {
  buildingId: string;
  buildingName: string;
  machines: MachineView[];
  holds: MachineHoldView[];
  holdsVerified: boolean;
  isManager: boolean;
  onSessionExpired: () => void;
  onNavigate: (view: AppView) => void;
}

type MachineFilter = 'ALL' | 'OPEN' | 'RUNNING' | 'ATTENTION';

const MACHINE_STATUS_META = {
  AVAILABLE: {
    label: 'Không bảo trì',
    tone: 'primary' as const,
    note: 'Trạng thái hệ thống cho phép nhận lượt. Luôn kiểm tra lồng giặt thực tế tại máy.',
  },
  RUNNING: {
    label: 'Đang giặt',
    tone: 'info' as const,
    note: 'Đang trong chu trình giặt theo phiên gần nhất.',
  },
  NEEDS_CHECK: {
    label: 'Cần kiểm tra',
    tone: 'warning' as const,
    note: 'Cần quản lý kiểm tra thực tế và xác nhận trống trước khi sử dụng tiếp.',
  },
  MAINTENANCE: {
    label: 'Đang bảo trì',
    tone: 'neutral' as const,
    note: 'Tạm ngưng phục vụ cho đến khi quản lý mở lại máy.',
  },
};

export default function MachinesView({
  buildingId,
  buildingName,
  machines,
  holds,
  holdsVerified,
  isManager,
  onSessionExpired,
  onNavigate,
}: MachinesViewProps) {
  const [filter, setFilter] = useState<MachineFilter>('ALL');
  const [qrMachine, setQrMachine] = useState<MachineView | null>(null);

  const heldIds = new Set(holdsVerified ? holds.map((h) => h.machineId) : []);

  const filteredMachines = machines.filter((m) => {
    if (filter === 'OPEN') return m.status === 'AVAILABLE' && !heldIds.has(m.id);
    if (filter === 'RUNNING') return m.status === 'RUNNING' || heldIds.has(m.id);
    if (filter === 'ATTENTION') return m.status === 'MAINTENANCE' || m.status === 'NEEDS_CHECK';
    return true;
  });

  return (
    <div className="view-stack">
      <header className="page-header">
        <div>
          <p className="page-kicker">{buildingName}</p>
          <h1 className="page-title">Danh sách máy giặt ({machines.length}/30)</h1>
        </div>
        {isManager && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => onNavigate('admin-machines')}
          >
            <WrenchIcon size={15} />
            <span>Quản lý &amp; bảo trì máy</span>
          </button>
        )}
      </header>

      <div className="filter-bar" role="tablist" aria-label="Lọc trạng thái máy">
        {(
          [
            ['ALL', `Tất cả (${machines.length})`],
            ['OPEN', 'Không bảo trì'],
            ['RUNNING', 'Đang sử dụng / giữ lượt'],
            ['ATTENTION', 'Bảo trì / cần kiểm tra'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            className={filter === key ? 'filter-chip active' : 'filter-chip'}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {filteredMachines.length === 0 ? (
        <div className="surface-card">
          <EmptyState
            icon={<WasherIcon size={24} />}
            title={machines.length === 0 ? 'Chưa có máy giặt nào' : 'Không có máy khớp bộ lọc'}
            description={
              machines.length === 0
                ? isManager
                  ? 'Hãy thêm máy giặt đầu tiên để cư dân có thể bắt đầu xếp hàng.'
                  : 'Quản lý tòa nhà chưa thêm máy giặt nào.'
                : 'Thử chuyển sang bộ lọc khác để xem toàn bộ danh sách máy.'
            }
            action={
              machines.length === 0 && isManager ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => onNavigate('admin-machines')}
                >
                  Đi tới Quản lý máy
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="machines-grid">
          {filteredMachines.map((machine) => {
            const isHeld = heldIds.has(machine.id);
            const meta = isHeld
              ? {
                  label: 'Đang giữ lượt',
                  tone: 'warning' as const,
                  note: 'Máy đang được giữ lượt trong tối đa 8 phút cho cư dân kế tiếp.',
                }
              : MACHINE_STATUS_META[machine.status];

            return (
              <article key={machine.id} className="machine-tile">
                <div className="machine-tile-head">
                  <div className="machine-tile-title">
                    <span className="machine-tile-icon" aria-hidden="true">
                      <WasherIcon size={19} />
                    </span>
                    <div>
                      <h2 className="machine-name">{machine.label}</h2>
                    </div>
                  </div>
                  <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                </div>

                <p className="machine-tile-note">{meta.note}</p>

                <div className="machine-tile-actions">
                  <Link
                    href={`/buildings/${buildingId}/machines/${machine.id}`}
                    className="btn btn-outline btn-sm"
                  >
                    Xem chi tiết
                  </Link>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setQrMachine(machine)}
                  >
                    <QrIcon size={14} />
                    <span>Mã QR</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(qrMachine)}
        onClose={() => setQrMachine(null)}
        title={qrMachine ? `Mã QR · ${qrMachine.label}` : 'Mã QR máy'}
        description="Quét mã để mở nhanh trang chi tiết máy. QR không tự động cấp quyền hoặc xác nhận máy trống."
        size="sm"
      >
        {qrMachine && (
          <div className="qr-modal-body">
            <MachineQrButton
              buildingId={buildingId}
              machineId={qrMachine.id}
              onSessionExpired={onSessionExpired}
            />
            <div className="qr-modal-link-row">
              <Link
                href={`/buildings/${buildingId}/machines/${qrMachine.id}`}
                className="btn btn-outline btn-sm"
              >
                Mở trang chi tiết máy
              </Link>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
