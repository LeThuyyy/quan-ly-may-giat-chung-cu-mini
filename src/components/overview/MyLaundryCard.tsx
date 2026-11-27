'use client';

import { useState } from 'react';
import { ClockIcon, QueueIcon, RefreshIcon, WasherIcon } from '@/components/Icons';
import MachineHoldCard, { type MachineHoldView } from '@/components/MachineHoldCard';
import type { QueueEntryView, QueueParticipation } from '@/components/QueuePanel';
import type { QueueEstimateView } from '@/components/QueueEstimate';
import WashCycleCard, { type WashCycleView } from '@/components/WashCycleCard';
import WashHoldActions from '@/components/WashHoldActions';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge';
import type { AppView } from '@/types/laundry';

interface MyLaundryCardProps {
  buildingId: string;
  accountId: string;
  participation: QueueParticipation;
  isSyncStale: boolean;
  entries: QueueEntryView[];
  myHold: MachineHoldView | null;
  holdHandover: WashCycleView | null | undefined;
  myCycles: WashCycleView[] | null;
  machineLabels: Record<string, string>;
  serverNow?: string;
  eta?: QueueEstimateView;
  onRefresh: () => Promise<void>;
  onSessionExpired: () => void;
  onNavigate: (view: AppView) => void;
}

function formatViTime(iso: string): string {
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed)
    ? new Date(parsed).toLocaleTimeString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '--:--';
}

export default function MyLaundryCard({
  buildingId,
  accountId,
  participation,
  isSyncStale,
  entries,
  myHold,
  holdHandover,
  myCycles,
  machineLabels,
  serverNow,
  eta,
  onRefresh,
  onSessionExpired,
  onNavigate,
}: MyLaundryCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);

  const ordered = [...entries].sort((a, b) => a.position - b.position);
  const ownIndex = ordered.findIndex((entry) => entry.accountId === accountId);
  const own = ownIndex >= 0 ? ordered[ownIndex] : undefined;
  const readyAhead = ownIndex >= 0 ? ordered.slice(0, ownIndex).filter((e) => e.ready).length : 0;

  async function mutateQueue(method: 'POST' | 'PATCH' | 'DELETE', ready?: boolean) {
    if (busy || isSyncStale) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/buildings/${buildingId}/queue${method === 'POST' ? '' : '/me'}`, {
        method,
        cache: 'no-store',
        ...(ready === undefined
          ? {}
          : {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ready }),
            }),
      });
      if (response.status === 401) {
        onSessionExpired();
        return;
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
        setError(
          typeof payload?.error === 'string'
            ? payload.error
            : 'Không thể cập nhật hàng đợi. Hãy tải lại trạng thái.',
        );
        return;
      }
      setConfirmLeaveOpen(false);
      await onRefresh();
    } catch {
      setError('Mất kết nối, chưa rõ thao tác đã được ghi nhận hay chưa. Hãy thử làm mới.');
    } finally {
      setBusy(false);
    }
  }

  if (isSyncStale || participation === 'UNKNOWN') {
    return (
      <section className="surface-card laundry-hero-card" aria-label="Trạng thái giặt của tôi">
        <div className="section-head">
          <div>
            <StatusBadge tone="warning">Cần đồng bộ lại</StatusBadge>
            <h2 className="section-heading">Chưa xác minh được lượt giặt của bạn</h2>
          </div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void onRefresh()}
            disabled={busy}
          >
            <RefreshIcon size={14} />
            <span>Tải lại trạng thái</span>
          </button>
        </div>
        <p className="muted-note">
          Hệ thống tạm khóa các thao tác để tránh lệch trạng thái giữa thiết bị và máy chủ.
        </p>
      </section>
    );
  }

  // D. Được giao máy (HELD)
  if (participation === 'HELD' && myHold) {
    return (
      <section className="laundry-held-stack" aria-label="Lượt giữ máy hiện tại">
        <div className="bento-2">
          <MachineHoldCard
            buildingId={buildingId}
            accountId={accountId}
            hold={myHold}
            machineLabel={machineLabels[myHold.machineId]}
            serverNow={serverNow}
            onRefresh={onRefresh}
            onSessionExpired={onSessionExpired}
          />
          <WashHoldActions
            key={`${buildingId}:${accountId}:${myHold.id}`}
            buildingId={buildingId}
            hold={myHold}
            handover={holdHandover}
            serverNow={serverNow}
            onRefresh={onRefresh}
            onSessionExpired={onSessionExpired}
          />
        </div>
      </section>
    );
  }

  // E. Đang giặt hoặc chờ bàn giao (WASHING)
  if (participation === 'WASHING') {
    return (
      <WashCycleCard
        key={`${buildingId}:${accountId}:${isSyncStale}`}
        buildingId={buildingId}
        cycles={myCycles}
        machineLabels={machineLabels}
        onRefresh={onRefresh}
        onSessionExpired={onSessionExpired}
      />
    );
  }

  // B & C. Đang trong hàng đợi (WAITING)
  if (participation === 'WAITING' && own) {
    return (
      <section className="surface-card laundry-hero-card" aria-label="Trạng thái giặt của tôi">
        <div className="section-head">
          <div>
            <StatusBadge tone={own.ready ? 'success' : 'warning'}>
              {own.ready ? 'Đang chờ · Đã sẵn sàng' : 'Đang chờ · Chưa sẵn sàng'}
            </StatusBadge>
            <h2 className="section-heading">
              Bạn đang ở vị trí #{ownIndex + 1} trong hàng đợi
            </h2>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onNavigate('queue')}
          >
            <QueueIcon size={15} />
            <span>Xem chi tiết hàng đợi</span>
          </button>
        </div>

        <div className="laundry-inline-stats">
          <div className="inline-stat">
            <span className="inline-stat-label">Người sẵn sàng phía trước</span>
            <strong className="inline-stat-value tabular">{readyAhead}</strong>
          </div>
          {own.ready && eta?.state === 'READY' && eta.rangeStart && eta.rangeEnd && (
            <div className="inline-stat">
              <span className="inline-stat-label">Khung giờ dự kiến (tham khảo)</span>
              <strong className="inline-stat-value tabular">
                <ClockIcon size={15} /> {formatViTime(eta.rangeStart)} – {formatViTime(eta.rangeEnd)}
              </strong>
            </div>
          )}
        </div>

        <p className="muted-note">
          {own.ready
            ? 'Khi tới lượt, hệ thống giao máy và bắt đầu đếm hạn giữ lượt 8 phút. Đóng trang không tự gia hạn hoặc tạm dừng lượt.'
            : 'Khi chưa sẵn sàng, bạn vẫn giữ nguyên vị trí hiện tại nhưng sẽ được bỏ qua khi có máy trống.'}
        </p>

        {error && <p className="alert alert-error" role="alert">{error}</p>}

        <div className="action-row">
          {!own.ready ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void mutateQueue('PATCH', true)}
            >
              {busy ? 'Đang cập nhật...' : 'Bật Sẵn sàng nhận máy'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-outline"
              disabled={busy}
              onClick={() => void mutateQueue('PATCH', false)}
            >
              {busy ? 'Đang cập nhật...' : 'Tạm chuyển Chưa sẵn sàng'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost-danger"
            disabled={busy}
            onClick={() => setConfirmLeaveOpen(true)}
          >
            Rời hàng
          </button>
        </div>

        <ConfirmDialog
          open={confirmLeaveOpen}
          onClose={() => setConfirmLeaveOpen(false)}
          onConfirm={() => mutateQueue('DELETE')}
          title="Rời khỏi hàng đợi?"
          description="Nếu rời hàng bây giờ, bạn sẽ mất vị trí hiện tại. Khi đăng ký lại, bạn sẽ xếp ở cuối hàng."
          confirmLabel="Xác nhận rời hàng"
          busy={busy}
        />
      </section>
    );
  }

  // A. Chưa tham gia hàng đợi (NONE)
  return (
    <section className="surface-card laundry-hero-card" aria-label="Trạng thái giặt của tôi">
      <div className="section-head">
        <div>
          <StatusBadge tone="neutral">Chưa xếp hàng</StatusBadge>
          <h2 className="section-heading">Sẵn sàng bắt đầu lượt giặt mới</h2>
        </div>
        <span className="hero-washer-badge" aria-hidden="true">
          <WasherIcon size={22} />
        </span>
      </div>

      <p className="muted-note">
        Tham gia hàng đợi của tòa nhà để được cấp máy tự động khi có lượt phù hợp, hoặc giữ chỗ trước với trạng thái Chưa sẵn sàng.
      </p>

      {error && <p className="alert alert-error" role="alert">{error}</p>}

      <div className="action-row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void mutateQueue('POST', true)}
        >
          {busy ? 'Đang xử lý...' : 'Vào hàng — Sẵn sàng'}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          disabled={busy}
          onClick={() => void mutateQueue('POST', false)}
        >
          Vào hàng — Chưa sẵn sàng
        </button>
      </div>
    </section>
  );
}
