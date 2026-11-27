'use client';

import { useEffect, useRef, useState } from 'react';
import { ClockIcon, InfoIcon, QueueIcon, SwapIcon } from '@/components/Icons';
import type { QueueEntryView, QueueParticipation } from '@/components/QueuePanel';
import type { QueueEstimateView } from '@/components/QueueEstimate';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';
import type { AppView } from '@/types/laundry';

interface QueueViewProps {
  buildingId: string;
  buildingName: string;
  accountId: string;
  entries: QueueEntryView[];
  participation: QueueParticipation;
  isSyncStale: boolean;
  refreshKey: number;
  initialEta?: QueueEstimateView;
  onRefresh: () => Promise<void>;
  onSessionExpired: () => void;
  onNavigate: (view: AppView) => void;
}

function formatViDateTime(iso: string): string {
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed)
    ? new Date(parsed).toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      })
    : 'Chưa rõ';
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function QueueView({
  buildingId,
  buildingName,
  accountId,
  entries,
  participation,
  isSyncStale,
  refreshKey,
  initialEta,
  onRefresh,
  onSessionExpired,
  onNavigate,
}: QueueViewProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const [eta, setEta] = useState<QueueEstimateView | null>(initialEta ?? null);
  const [etaError, setEtaError] = useState<string | null>(null);
  const [etaLoading, setEtaLoading] = useState(!initialEta);
  const callbacks = useRef({ onRefresh, onSessionExpired });

  useEffect(() => {
    callbacks.current = { onRefresh, onSessionExpired };
  }, [onRefresh, onSessionExpired]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function loadEta() {
      try {
        const res = await fetch(`/api/buildings/${buildingId}/eta/me`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!active) return;
        if (res.status === 401) {
          callbacks.current.onSessionExpired();
          return;
        }
        if (!res.ok) throw new Error('Không tải được ước tính.');
        const data = (await res.json()) as QueueEstimateView;
        if (active) {
          setEta(data);
          setEtaError(null);
        }
      } catch (err) {
        if (active && !controller.signal.aborted) {
          setEtaError(err instanceof Error ? err.message : 'Không tải được ước tính.');
        }
      } finally {
        if (active) setEtaLoading(false);
      }
    }
    void Promise.resolve().then(() => {
      if (!active) return;
      setEtaLoading(true);
      setEtaError(null);
      return loadEta();
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [buildingId, refreshKey]);

  const displayedEta = eta ?? initialEta ?? null;

  const ordered = [...entries].sort((a, b) => a.position - b.position);
  const ownIndex = ordered.findIndex((e) => e.accountId === accountId);
  const own = ownIndex >= 0 ? ordered[ownIndex] : undefined;
  const readyAhead = ownIndex >= 0 ? ordered.slice(0, ownIndex).filter((e) => e.ready).length : 0;
  const consistent = participation === 'WAITING' ? Boolean(own) : !own;
  const disabled = busy || isSyncStale || !consistent || participation === 'UNKNOWN';

  async function mutateQueue(method: 'POST' | 'PATCH' | 'DELETE', ready?: boolean) {
    if (disabled) return;
    setBusy(true);
    setError(null);
    setNotice(null);
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
        callbacks.current.onSessionExpired();
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
      setNotice(
        method === 'DELETE'
          ? 'Đã rời khỏi hàng đợi.'
          : 'Đã cập nhật trạng thái hàng đợi.',
      );
      await callbacks.current.onRefresh();
    } catch {
      setError('Mất kết nối, chưa rõ thao tác đã được ghi nhận hay chưa. Hãy làm mới.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="view-stack">
      <header className="page-header">
        <div>
          <p className="page-kicker">{buildingName}</p>
          <h1 className="page-title">Hàng đợi chung</h1>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-expanded={showRules}
            onClick={() => setShowRules((v) => !v)}
          >
            <InfoIcon size={15} />
            <span>{showRules ? 'Ẩn quy tắc' : 'Quy tắc hàng đợi'}</span>
          </button>
          {participation === 'WAITING' && ownIndex >= 0 && ownIndex < ordered.length - 1 && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => onNavigate('swaps')}
            >
              <SwapIcon size={15} />
              <span>Đổi lượt</span>
            </button>
          )}
        </div>
      </header>

      {showRules && (
        <div className="surface-card surface-subtle-card" role="region" aria-label="Quy tắc hàng đợi">
          <ul className="rules-list">
            <li>Người <strong>Chưa sẵn sàng</strong> vẫn giữ nguyên vị trí xếp hàng nhưng sẽ được bỏ qua khi máy trống được giao.</li>
            <li>Vị trí xếp hàng chỉ phản ánh thứ tự chờ, không cam kết giờ nhận máy cố định nếu người phía trước bật/tắt Sẵn sàng hoặc đổi lượt.</li>
            <li>Khi được giao máy, bạn có <strong>8 phút</strong> để kiểm tra thực tế và bắt đầu. Đóng trang không tự gia hạn hoặc tạm dừng thời gian này.</li>
          </ul>
        </div>
      )}

      <div className="bento-2">
        <section className="surface-card" aria-label="Vị trí của tôi">
          <div className="section-head">
            <h2 className="section-title-sm">
              <QueueIcon size={17} /> Trạng thái của bạn
            </h2>
            {participation === 'WAITING' && own && (
              <StatusBadge tone={own.ready ? 'success' : 'warning'}>
                {own.ready ? 'Sẵn sàng nhận máy' : 'Chưa sẵn sàng'}
              </StatusBadge>
            )}
          </div>

          {!consistent || participation === 'UNKNOWN' ? (
            <p className="muted-note">Chưa xác minh được trạng thái cá nhân. Hãy làm mới dữ liệu.</p>
          ) : participation === 'HELD' ? (
            <div className="stack-sm">
              <p className="muted-note">Bạn đang được giữ máy 8 phút.</p>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onNavigate('overview')}>
                Mở thẻ giữ máy tại Tổng quan
              </button>
            </div>
          ) : participation === 'WASHING' ? (
            <div className="stack-sm">
              <p className="muted-note">Bạn đang có mẻ giặt chưa hoàn tất bàn giao.</p>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onNavigate('overview')}>
                Xem mẻ giặt tại Tổng quan
              </button>
            </div>
          ) : participation === 'WAITING' && own ? (
            <div className="stack-sm">
              <div className="laundry-inline-stats">
                <div className="inline-stat">
                  <span className="inline-stat-label">Vị trí của bạn</span>
                  <strong className="inline-stat-value tabular">#{ownIndex + 1}</strong>
                </div>
                <div className="inline-stat">
                  <span className="inline-stat-label">Người sẵn sàng phía trước</span>
                  <strong className="inline-stat-value tabular">{readyAhead}</strong>
                </div>
              </div>
              <p className="muted-note">
                Chỉ bật Sẵn sàng khi bạn có thể lên kiểm tra máy trong vòng 8 phút.
              </p>
              <div className="action-row">
                <button
                  type="button"
                  className={own.ready ? 'btn btn-outline' : 'btn btn-primary'}
                  disabled={disabled}
                  onClick={() => void mutateQueue('PATCH', !own.ready)}
                >
                  {own.ready ? 'Tạm chuyển Chưa sẵn sàng' : 'Bật Sẵn sàng nhận máy'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost-danger"
                  disabled={disabled}
                  onClick={() => setConfirmLeaveOpen(true)}
                >
                  Rời hàng
                </button>
              </div>
            </div>
          ) : (
            <div className="stack-sm">
              <p className="muted-note">
                Bạn chưa tham gia hàng đợi. Chọn vào hàng ở trạng thái sẵn sàng hoặc giữ chỗ trước.
              </p>
              <div className="action-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={disabled}
                  onClick={() => void mutateQueue('POST', true)}
                >
                  Vào hàng — Sẵn sàng
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={disabled}
                  onClick={() => void mutateQueue('POST', false)}
                >
                  Vào hàng — Chưa sẵn sàng
                </button>
              </div>
            </div>
          )}

          {notice && <p className="alert alert-ok" role="status">{notice}</p>}
          {error && <p className="alert alert-error" role="alert">{error}</p>}
        </section>

        <section className="surface-card" aria-label="Ước tính tới lượt">
          <div className="section-head">
            <h2 className="section-title-sm">
              <ClockIcon size={17} /> Thời gian dự kiến (ETA)
            </h2>
            {isSyncStale && <StatusBadge tone="warning">Dữ liệu có thể cũ</StatusBadge>}
          </div>

          {etaLoading && !displayedEta ? (
            <p className="muted-note">Đang tính ước tính...</p>
          ) : etaError && !displayedEta ? (
            <p className="alert alert-error" role="alert">{etaError}</p>
          ) : displayedEta ? (
            <div className="stack-sm">
              <div className={displayedEta.state === 'READY' ? 'eta-callout eta-callout-ready' : 'eta-callout'}>
                <p><strong>{displayedEta.reason}</strong></p>
                {displayedEta.state === 'READY' && displayedEta.rangeStart && displayedEta.rangeEnd && (
                  <p className="tabular">
                    Khung tham khảo: <strong>{formatViDateTime(displayedEta.rangeStart)} – {formatViDateTime(displayedEta.rangeEnd)}</strong>
                  </p>
                )}
              </div>
              {displayedEta.assumptions.length > 0 && (
                <details className="help-details">
                  <summary>Cơ sở ước tính (tham khảo)</summary>
                  <ul className="assumptions-list">
                    {displayedEta.assumptions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </details>
              )}
              <span className="muted-note" style={{ margin: 0 }}>
                Cập nhật theo giờ máy chủ: {formatViDateTime(displayedEta.serverNow)} · ETA không chứng minh máy đã dừng.
              </span>
            </div>
          ) : null}
        </section>
      </div>

      <section className="surface-card" aria-label="Danh sách người đang chờ">
        <div className="section-head">
          <h2 className="section-title-sm">Thứ tự trong hàng đợi ({ordered.length})</h2>
        </div>

        {ordered.length === 0 ? (
          <EmptyState
            compact
            icon={<QueueIcon size={22} />}
            title="Hàng đợi đang trống"
            description="Hiện chưa có cư dân nào xếp hàng chờ máy."
          />
        ) : (
          <ol className="queue-ordered-list">
            {ordered.map((entry, idx) => {
              const isMe = entry.accountId === accountId;
              const canSwapWith = ownIndex >= 0 && idx > ownIndex;
              return (
                <li
                  key={entry.id}
                  className={isMe ? 'queue-person-row me' : 'queue-person-row'}
                  aria-current={isMe ? 'true' : undefined}
                >
                  <div className="queue-person-left">
                    <span className="rank-badge tabular">#{idx + 1}</span>
                    <span className="avatar-circle avatar-sm" aria-hidden="true">
                      {getInitials(entry.displayName)}
                    </span>
                    <div>
                      <strong className="queue-person-name">
                        {entry.displayName} {isMe && <span className="me-tag">(Bạn)</span>}
                      </strong>
                    </div>
                  </div>
                  <div className="queue-person-right">
                    <StatusBadge tone={entry.ready ? 'success' : 'neutral'}>
                      {entry.ready ? 'Sẵn sàng' : 'Chưa sẵn sàng'}
                    </StatusBadge>
                    {canSwapWith && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => onNavigate('swaps')}
                      >
                        Đổi lượt
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <ConfirmDialog
        open={confirmLeaveOpen}
        onClose={() => setConfirmLeaveOpen(false)}
        onConfirm={() => mutateQueue('DELETE')}
        title="Rời khỏi hàng đợi?"
        description="Rời hàng sẽ hủy vị trí hiện tại của bạn. Nếu vào lại, bạn sẽ xếp ở cuối hàng đợi."
        confirmLabel="Xác nhận rời hàng"
        busy={busy}
      />
    </div>
  );
}
