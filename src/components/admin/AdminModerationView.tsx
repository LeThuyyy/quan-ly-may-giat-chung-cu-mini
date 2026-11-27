'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatReport } from '@/components/ChatPanel';
import { FlagIcon } from '@/components/Icons';
import type { WashCycleView } from '@/components/WashCycleCard';
import WashManagerPanel from '@/components/WashManagerPanel';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';

interface Page<T> {
  items: T[];
  page: number;
  size: number;
  hasNext: boolean;
}

interface AdminModerationViewProps {
  buildingId: string;
  buildingName: string;
  issues: WashCycleView[] | null;
  machineLabels: Record<string, string>;
  refreshKey: number;
  onRefresh: () => Promise<void>;
  onSessionExpired: () => void;
}

const REASON_LABELS: Record<string, string> = {
  SPAM: 'Spam / Quảng cáo',
  ABUSE: 'Lạm dụng / Làm phiền',
  OTHER: 'Lý do khác',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    : iso;
}

export default function AdminModerationView({
  buildingId,
  buildingName,
  issues,
  machineLabels,
  refreshKey,
  onRefresh,
  onSessionExpired,
}: AdminModerationViewProps) {
  const [reports, setReports] = useState<ChatReport[]>([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [hideTarget, setHideTarget] = useState<ChatReport | null>(null);
  const [reason, setReason] = useState<'SPAM' | 'ABUSE' | 'OTHER'>('SPAM');

  const mounted = useRef(false);
  const callbacks = useRef({ onRefresh, onSessionExpired });

  useEffect(() => {
    callbacks.current = { onRefresh, onSessionExpired };
  }, [onRefresh, onSessionExpired]);

  async function loadReports(targetPage: number, signal?: AbortSignal) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/buildings/${buildingId}/chat/reports?page=${targetPage}&size=20`, {
        cache: 'no-store',
        signal,
      });
      if (!mounted.current || signal?.aborted) return;
      if (res.status === 401) {
        callbacks.current.onSessionExpired();
        return;
      }
      if (!res.ok) throw new Error('Không tải được danh sách báo cáo tin nhắn.');
      const data = (await res.json()) as Page<ChatReport>;
      if (!mounted.current || signal?.aborted) return;
      setReports(data.items);
      setPage(data.page);
      setHasNext(data.hasNext);
    } catch (err) {
      if (mounted.current && !signal?.aborted) {
        setError(err instanceof Error ? err.message : 'Không tải được báo cáo.');
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (mounted.current && !controller.signal.aborted) {
        return loadReports(0, controller.signal);
      }
    });
    return () => {
      mounted.current = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingId, refreshKey]);

  async function handleHideReport() {
    if (!hideTarget) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(
        `/api/buildings/${buildingId}/chat/messages/${hideTarget.messageId}/hide`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reasonCode: reason }),
          cache: 'no-store',
        },
      );
      if (res.status === 401) {
        callbacks.current.onSessionExpired();
        return;
      }
      if (!res.ok) throw new Error('Không thể ẩn tin nhắn này.');
      setHideTarget(null);
      setNotice('Đã ẩn tin nhắn bị báo cáo.');
      await callbacks.current.onRefresh();
      await loadReports(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xử lý báo cáo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="view-stack">
      <header className="page-header">
        <div>
          <p className="page-kicker">{buildingName} · Quản trị</p>
          <h1 className="page-title">Kiểm duyệt &amp; Sự cố</h1>
        </div>
      </header>

      <WashManagerPanel
        buildingId={buildingId}
        issues={issues}
        machineLabels={machineLabels}
        onRefresh={onRefresh}
        onSessionExpired={onSessionExpired}
      />

      <section className="surface-card" aria-label="Báo cáo tin nhắn trong tòa">
        <div className="section-head">
          <div>
            <h2 className="section-title-sm">
              <FlagIcon size={17} /> Báo cáo tin nhắn ({reports.length})
            </h2>
            <p className="muted-note" style={{ margin: 0 }}>
              Báo cáo của cư dân không tự động ẩn tin nhắn. Quản lý xem xét và ẩn khi cần thiết.
            </p>
          </div>
        </div>

        {error && <p className="alert alert-error" role="alert">{error}</p>}
        {notice && <p className="alert alert-ok" role="status">{notice}</p>}

        {busy && reports.length === 0 ? (
          <p className="muted-note">Đang tải báo cáo...</p>
        ) : reports.length === 0 ? (
          <EmptyState
            compact
            icon={<FlagIcon size={22} />}
            title="Không có báo cáo tin nhắn"
            description="Chưa có tin nhắn nào bị báo cáo trong 30 ngày gần đây."
          />
        ) : (
          <ul className="queue-list">
            {reports.map((report) => (
              <li key={report.id} className="queue-row">
                <div>
                  <div className="action-row" style={{ gap: 8 }}>
                    <StatusBadge tone="warning">
                      {REASON_LABELS[report.reasonCode] ?? report.reasonCode}
                    </StatusBadge>
                    <code className="id-chip">{report.messageId.slice(0, 8)}...</code>
                  </div>
                  <span className="muted-note" style={{ margin: 0 }}>
                    Thời gian báo cáo: {formatTime(report.reportedAt)}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={busy}
                  onClick={() => {
                    setReason(
                      report.reasonCode === 'ABUSE' || report.reasonCode === 'OTHER'
                        ? report.reasonCode
                        : 'SPAM',
                    );
                    setHideTarget(report);
                  }}
                >
                  Ẩn tin nhắn
                </button>
              </li>
            ))}
          </ul>
        )}

        {(page > 0 || hasNext) && (
          <div className="pagination-bar">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={busy || page === 0}
              onClick={() => void loadReports(page - 1)}
            >
              Trang trước
            </button>
            <span>Trang {page + 1}</span>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={busy || !hasNext}
              onClick={() => void loadReports(page + 1)}
            >
              Trang sau
            </button>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(hideTarget)}
        onClose={() => setHideTarget(null)}
        onConfirm={handleHideReport}
        title="Ẩn tin nhắn bị báo cáo?"
        description="Tin nhắn này sẽ bị ẩn khỏi khung trò chuyện tòa nhà và được lưu vết trong nhật ký kiểm duyệt."
        confirmLabel="Xác nhận ẩn"
        busy={busy}
      >
        <label className="field" style={{ marginTop: 8 }}>
          <span>Lý do kiểm duyệt</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as 'SPAM' | 'ABUSE' | 'OTHER')}
          >
            <option value="SPAM">Spam / Quảng cáo</option>
            <option value="ABUSE">Lạm dụng / Làm phiền</option>
            <option value="OTHER">Lý do khác</option>
          </select>
        </label>
      </ConfirmDialog>
    </div>
  );
}
