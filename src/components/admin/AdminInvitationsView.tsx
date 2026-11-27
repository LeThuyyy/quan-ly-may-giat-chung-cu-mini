'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckIcon, CopyIcon, PlusIcon, TicketIcon } from '@/components/Icons';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import StatusBadge from '@/components/ui/StatusBadge';

interface Invitation {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
}

interface Page<T> {
  items: T[];
  page: number;
  size: number;
  hasNext: boolean;
}

interface AdminInvitationsViewProps {
  buildingId: string;
  buildingName: string;
  isSyncStale: boolean;
  busy: boolean;
  inviteToken: string | null;
  refreshKey: number;
  onCreateInvite: () => Promise<void>;
  onClearInviteToken: () => void;
  onRefresh: () => Promise<void>;
  onSessionExpired: () => void;
}

function formatTime(value: string): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed)
    ? new Date(parsed).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    : value;
}

export default function AdminInvitationsView({
  buildingId,
  buildingName,
  isSyncStale,
  busy,
  inviteToken,
  refreshKey,
  onCreateInvite,
  onClearInviteToken,
  onRefresh,
  onSessionExpired,
}: AdminInvitationsViewProps) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<Invitation | null>(null);
  const [mutating, setMutating] = useState(false);

  const mounted = useRef(false);
  const callbacks = useRef({ onRefresh, onSessionExpired });

  useEffect(() => {
    callbacks.current = { onRefresh, onSessionExpired };
  }, [onRefresh, onSessionExpired]);

  async function load(targetPage: number, signal?: AbortSignal) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/buildings/${buildingId}/invitations?page=${targetPage}&size=20`, {
        cache: 'no-store',
        signal,
      });
      if (!mounted.current || signal?.aborted) return;
      if (res.status === 401) {
        callbacks.current.onSessionExpired();
        return;
      }
      if (!res.ok) throw new Error('Không tải được danh sách mã mời.');
      const data = (await res.json()) as Page<Invitation>;
      if (!mounted.current || signal?.aborted) return;
      setInvitations(data.items);
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

  async function handleCopyToken() {
    if (!inviteToken) return;
    try {
      await navigator.clipboard.writeText(inviteToken);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Không sao chép tự động được; vui lòng chọn và sao chép chuỗi mã mời bên trên.');
    }
  }

  async function handleRevoke() {
    if (!revokeTarget) return;
    setMutating(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(
        `/api/buildings/${buildingId}/invitations/${encodeURIComponent(revokeTarget.id)}/revoke`,
        { method: 'POST', cache: 'no-store' },
      );
      if (res.status === 401) {
        callbacks.current.onSessionExpired();
        return;
      }
      if (!res.ok) throw new Error('Không thu hồi được mã mời.');
      setRevokeTarget(null);
      setNotice('Đã thu hồi mã mời.');
      await callbacks.current.onRefresh();
      await load(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thu hồi được mã mời.');
      setRevokeTarget(null);
    } finally {
      setMutating(false);
    }
  }

  const disabled = busy || isSyncStale || mutating;

  return (
    <div className="view-stack">
      <header className="page-header">
        <div>
          <p className="page-kicker">{buildingName} · Quản trị</p>
          <h1 className="page-title">Mã mời tham gia tòa</h1>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={disabled}
          onClick={() => void onCreateInvite()}
        >
          <PlusIcon size={15} />
          <span>Tạo mã mời 7 ngày</span>
        </button>
      </header>

      <div className="surface-card surface-subtle-card">
        <p className="muted-note" style={{ margin: 0 }}>
          Mỗi mã mời có hiệu lực cố định 7 ngày và chỉ hiển thị đầy đủ một lần ngay khi tạo. Bảng dưới đây lưu lại trạng thái để bạn theo dõi hoặc thu hồi khi cần.
        </p>
      </div>

      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {notice && <p className="alert alert-ok" role="status">{notice}</p>}

      <section className="surface-card" aria-label="Danh sách lời mời">
        {loading && invitations.length === 0 ? (
          <p className="muted-note">Đang tải danh sách mã mời...</p>
        ) : invitations.length === 0 ? (
          <EmptyState
            compact
            icon={<TicketIcon size={22} />}
            title="Chưa có mã mời nào"
            description="Nhấn “Tạo mã mời 7 ngày” để tạo mã gửi cho cư dân mới."
          />
        ) : (
          <ul className="queue-list">
            {invitations.map((invite) => {
              const statusUi =
                invite.status === 'ACTIVE'
                  ? { label: 'Còn hiệu lực', tone: 'success' as const }
                  : invite.status === 'EXPIRED'
                    ? { label: 'Hết hạn', tone: 'neutral' as const }
                    : { label: 'Đã thu hồi', tone: 'warning' as const };

              return (
                <li key={invite.id} className="queue-row">
                  <div>
                    <div className="action-row" style={{ gap: 8 }}>
                      <code className="id-chip">{invite.id.slice(0, 8)}...</code>
                      <StatusBadge tone={statusUi.tone}>{statusUi.label}</StatusBadge>
                    </div>
                    <div className="muted-note" style={{ margin: '4px 0 0' }}>
                      Tạo: {formatTime(invite.createdAt)} · Hết hạn: {formatTime(invite.expiresAt)}
                      {invite.revokedAt ? ` · Thu hồi: ${formatTime(invite.revokedAt)}` : ''}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={disabled || invite.status !== 'ACTIVE'}
                    onClick={() => setRevokeTarget(invite)}
                  >
                    Thu hồi
                  </button>
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

      <Modal
        open={Boolean(inviteToken)}
        onClose={() => {
          setCopied(false);
          onClearInviteToken();
        }}
        title="Mã mời mới đã sẵn sàng"
        description="Sao chép và gửi chuỗi mã mời này cho cư dân. Vì lý do bảo mật, hệ thống không hiển thị lại mã gốc sau khi bạn đóng hộp thoại."
        size="sm"
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setCopied(false);
                onClearInviteToken();
              }}
            >
              Đóng
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleCopyToken()}
            >
              {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
              <span>{copied ? 'Đã sao chép' : 'Sao chép mã mời'}</span>
            </button>
          </>
        }
      >
        {inviteToken && (
          <div className="token-box" style={{ marginTop: 4 }}>
            <code>{inviteToken}</code>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevoke}
        title="Thu hồi mã mời này?"
        description="Cư dân sẽ không thể dùng mã mời này để gửi yêu cầu tham gia tòa nữa."
        confirmLabel="Xác nhận thu hồi"
        busy={mutating}
      />
    </div>
  );
}
