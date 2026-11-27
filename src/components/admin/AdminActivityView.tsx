'use client';

import { useEffect, useRef, useState } from 'react';
import { HistoryIcon } from '@/components/Icons';
import EmptyState from '@/components/ui/EmptyState';

interface Activity {
  id: string;
  actorId: string | null;
  action: string;
  targetId: string | null;
  machineId: string | null;
  beforeState: string | null;
  afterState: string | null;
  occurredAt: string;
}

interface Page<T> {
  items: T[];
  page: number;
  size: number;
  hasNext: boolean;
}

interface AdminActivityViewProps {
  buildingId: string;
  buildingName: string;
  machineLabels: Record<string, string>;
  refreshKey: number;
  onSessionExpired: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  BUILDING_CREATED: 'Tạo tòa nhà',
  MACHINE_ADDED: 'Thêm máy giặt',
  MACHINE_MAINTENANCE_CHANGED: 'Đổi trạng thái bảo trì',
  MACHINE_VERIFIED_FREE: 'Xác nhận máy trống',
  INVITATION_CREATED: 'Tạo mã mời 7 ngày',
  INVITATION_REVOKED: 'Thu hồi mã mời',
  MEMBERSHIP_REQUESTED: 'Yêu cầu tham gia tòa',
  MEMBERSHIP_APPROVED: 'Duyệt thành viên',
  MEMBERSHIP_ROLE_CHANGED: 'Đổi vai trò thành viên',
  MEMBERSHIP_REMOVED: 'Gỡ thành viên',
  MEMBERSHIP_RESTORED: 'Khôi phục thành viên',
  QUEUE_JOINED: 'Tham gia hàng đợi',
  QUEUE_READINESS_CHANGED: 'Đổi trạng thái sẵn sàng',
  QUEUE_LEFT: 'Rời hàng đợi',
  HOLD_ASSIGNED: 'Giao máy giữ lượt 8 phút',
  HOLD_CHECKED: 'Xác nhận kiểm tra tại máy',
  HOLD_YIELDED: 'Nhường lượt',
  HOLD_UNUSABLE: 'Báo máy chưa dùng được',
  HOLD_EXPIRED: 'Hết hạn giữ lượt',
  WASH_STARTED: 'Bắt đầu mẻ giặt',
  WASH_COMPLETED: 'Hoàn tất bàn giao mẻ giặt',
  WASH_REMAINING_REPORTED: 'Cập nhật phút còn lại',
  WASH_ISSUE_RESOLVED: 'Xử lý sự cố mẻ giặt',
  SWAP_CREATED: 'Gửi lời mời đổi lượt',
  SWAP_ACCEPTED: 'Đồng ý đổi lượt',
  SWAP_REJECTED: 'Từ chối đổi lượt',
  SWAP_CANCELLED: 'Hủy lời mời đổi lượt',
  SWAP_EXPIRED: 'Hết hạn lời mời đổi lượt',
  SWAP_INVALIDATED: 'Hủy hiệu lực lời mời đổi lượt',
  CHAT_POST: 'Gửi tin nhắn trò chuyện',
  CHAT_REPORT: 'Báo cáo tin nhắn',
  CHAT_HIDE: 'Ẩn tin nhắn',
};

function formatTime(value: string): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed)
    ? new Date(parsed).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    : value;
}

export default function AdminActivityView({
  buildingId,
  buildingName,
  machineLabels,
  refreshKey,
  onSessionExpired,
}: AdminActivityViewProps) {
  const [items, setItems] = useState<Activity[]>([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const mounted = useRef(false);
  const expiredRef = useRef(onSessionExpired);

  useEffect(() => {
    expiredRef.current = onSessionExpired;
  }, [onSessionExpired]);

  async function load(targetPage: number, signal?: AbortSignal) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/buildings/${buildingId}/activity?page=${targetPage}&size=20`, {
        cache: 'no-store',
        signal,
      });
      if (!mounted.current || signal?.aborted) return;
      if (res.status === 401) {
        expiredRef.current();
        return;
      }
      if (!res.ok) throw new Error('Không tải được nhật ký hoạt động.');
      const data = (await res.json()) as Page<Activity>;
      if (!mounted.current || signal?.aborted) return;
      setItems(data.items);
      setPage(data.page);
      setHasNext(data.hasNext);
    } catch (err) {
      if (mounted.current && !signal?.aborted) {
        setError(err instanceof Error ? err.message : 'Không tải được dữ liệu.');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (mounted.current && !controller.signal.aborted) {
        return load(0, controller.signal);
      }
    });
    return () => {
      mounted.current = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingId, refreshKey]);

  return (
    <div className="view-stack">
      <header className="page-header">
        <div>
          <p className="page-kicker">{buildingName} · Quản trị</p>
          <h1 className="page-title">Nhật ký hoạt động</h1>
        </div>
      </header>

      {error && <p className="alert alert-error" role="alert">{error}</p>}

      <section className="surface-card" aria-label="Dòng thời gian hoạt động">
        {loading && items.length === 0 ? (
          <p className="muted-note">Đang tải nhật ký...</p>
        ) : items.length === 0 ? (
          <EmptyState
            compact
            icon={<HistoryIcon size={22} />}
            title="Chưa có hoạt động nào"
            description="Các thay đổi về máy, hàng đợi, thành viên và kiểm duyệt sẽ được ghi nhận tại đây."
          />
        ) : (
          <ul className="activity-timeline">
            {items.map((item) => {
              const label = ACTION_LABELS[item.action] ?? item.action;
              const machineLabel = item.machineId ? machineLabels[item.machineId] : null;
              return (
                <li key={item.id} className="activity-row">
                  <div className="activity-main">
                    <strong>{label}</strong>
                    <div className="muted-note" style={{ margin: '2px 0 0' }}>
                      {machineLabel ? `Máy: ${machineLabel} · ` : ''}
                      {item.beforeState || item.afterState
                        ? `Trạng thái: ${item.beforeState ?? '—'} → ${item.afterState ?? '—'}`
                        : item.actorId
                          ? `Mã người thực hiện: ${item.actorId.slice(0, 8)}...`
                          : 'Hệ thống tự động'}
                    </div>
                  </div>
                  <time className="activity-time" dateTime={item.occurredAt}>
                    {formatTime(item.occurredAt)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}

        {(page > 0 || hasNext) && (
          <div className="pagination-bar">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={loading || page === 0}
              onClick={() => void load(page - 1)}
            >
              Trang trước
            </button>
            <span>Trang {page + 1}</span>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={loading || !hasNext}
              onClick={() => void load(page + 1)}
            >
              Trang sau
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
