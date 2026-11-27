'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import ConfirmMachineFreeButton from '@/components/ConfirmMachineFreeButton';
import { PlusIcon, QrIcon, WrenchIcon } from '@/components/Icons';
import type { MachineHoldView } from '@/components/MachineHoldCard';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import StatusBadge from '@/components/ui/StatusBadge';
import type { MachineView } from '@/types/laundry';

interface AdminMachinesViewProps {
  buildingId: string;
  buildingName: string;
  accountId: string;
  machines: MachineView[];
  holds: MachineHoldView[];
  holdsVerified: boolean;
  isSyncStale: boolean;
  busy: boolean;
  onAddMachine: (label: string) => Promise<boolean>;
  onToggleMaintenance: (machine: MachineView) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSessionExpired: () => void;
}

const STATUS_BADGE = {
  AVAILABLE: { label: 'Không bảo trì', tone: 'primary' as const },
  RUNNING: { label: 'Đang giặt', tone: 'info' as const },
  NEEDS_CHECK: { label: 'Cần kiểm tra', tone: 'warning' as const },
  MAINTENANCE: { label: 'Đang bảo trì', tone: 'neutral' as const },
};

export default function AdminMachinesView({
  buildingId,
  buildingName,
  accountId,
  machines,
  holds,
  holdsVerified,
  isSyncStale,
  busy,
  onAddMachine,
  onToggleMaintenance,
  onRefresh,
  onSessionExpired,
}: AdminMachinesViewProps) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const actionsDisabled = busy || isSyncStale;
  const canAddMore = machines.length < 30;
  const heldIds = new Set(holdsVerified ? holds.map((h) => h.machineId) : []);

  async function handleSubmitAdd(e: FormEvent) {
    e.preventDefault();
    const trimmed = newLabel.trim();
    if (!trimmed) {
      setLocalError('Vui lòng nhập tên máy giặt.');
      return;
    }
    if (trimmed.length > 60) {
      setLocalError('Tên máy tối đa 60 ký tự.');
      return;
    }
    setLocalError(null);
    const ok = await onAddMachine(trimmed);
    if (ok) {
      setNewLabel('');
      setAddModalOpen(false);
    }
  }

  return (
    <div className="view-stack">
      <header className="page-header">
        <div>
          <p className="page-kicker">{buildingName} · Quản trị</p>
          <h1 className="page-title">Quản lý máy giặt ({machines.length}/30)</h1>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={actionsDisabled || !canAddMore}
          onClick={() => {
            setLocalError(null);
            setAddModalOpen(true);
          }}
        >
          <PlusIcon size={15} />
          <span>{canAddMore ? 'Thêm máy' : 'Đã đạt tối đa 30 máy'}</span>
        </button>
      </header>

      <div className="surface-card surface-subtle-card">
        <p className="muted-note" style={{ margin: 0 }}>
          Mở lại máy sau bảo trì chỉ bỏ cờ bảo trì, không tự xác nhận lồng giặt trống. Nếu máy bị kẹt sau bàn giao hoặc ở trạng thái Cần kiểm tra, hãy kiểm tra tại chỗ rồi dùng mục <strong>Xác nhận máy trống</strong>.
        </p>
      </div>

      {machines.length === 0 ? (
        <div className="surface-card">
          <EmptyState
            icon={<WrenchIcon size={24} />}
            title="Chưa có máy giặt nào"
            description="Thêm máy giặt đầu tiên cho tòa nhà (tối đa 30 máy)."
            action={
              <button
                type="button"
                className="btn btn-primary"
                disabled={actionsDisabled}
                onClick={() => setAddModalOpen(true)}
              >
                <PlusIcon size={15} />
                <span>Thêm máy</span>
              </button>
            }
          />
        </div>
      ) : (
        <div className="admin-machines-list">
          {machines.map((machine) => {
            const isHeld = heldIds.has(machine.id);
            const badge = isHeld
              ? { label: 'Đang giữ lượt', tone: 'warning' as const }
              : STATUS_BADGE[machine.status];

            return (
              <article key={machine.id} className="surface-card admin-machine-card">
                <div className="admin-machine-top">
                  <div>
                    <div className="action-row" style={{ gap: 8 }}>
                      <h2 className="machine-name">{machine.label}</h2>
                      <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                    </div>
                  </div>
                  <Link
                    href={`/buildings/${buildingId}/machines/${machine.id}`}
                    className="btn btn-ghost btn-sm"
                  >
                    <QrIcon size={14} />
                    <span>Chi tiết / QR</span>
                  </Link>
                </div>

                <div className="admin-machine-actions">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={actionsDisabled}
                    onClick={() => void onToggleMaintenance(machine)}
                  >
                    {machine.status === 'MAINTENANCE' ? 'Mở lại máy' : 'Đánh dấu bảo trì'}
                  </button>

                  <ConfirmMachineFreeButton
                    buildingId={buildingId}
                    accountId={accountId}
                    isManager={!isSyncStale}
                    machine={machine}
                    hasActiveHold={!isSyncStale && holdsVerified ? holds.some((h) => h.machineId === machine.id) : null}
                    onRefresh={onRefresh}
                    onSessionExpired={onSessionExpired}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={addModalOpen}
        onClose={busy ? () => {} : () => setAddModalOpen(false)}
        title="Thêm máy giặt mới"
        description={`Tòa nhà hiện có ${machines.length}/30 máy giặt.`}
        size="sm"
      >
        <form className="ui-modal-form" onSubmit={handleSubmitAdd}>
          <label className="field">
            <span>Tên / vị trí máy (tối đa 60 ký tự)</span>
            <input
              type="text"
              required
              maxLength={60}
              value={newLabel}
              disabled={busy}
              onChange={(e) => {
                setNewLabel(e.target.value);
                setLocalError(null);
              }}
              placeholder="vd: Máy tầng 2 - Cửa ngang"
            />
          </label>
          {localError && <p className="alert alert-error" role="alert">{localError}</p>}
          <div className="ui-modal-actions">
            <button
              type="button"
              className="btn btn-outline"
              disabled={busy}
              onClick={() => setAddModalOpen(false)}
            >
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={actionsDisabled}>
              {busy ? 'Đang thêm...' : 'Thêm máy'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
