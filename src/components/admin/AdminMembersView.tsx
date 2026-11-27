'use client';

import { useEffect, useRef, useState } from 'react';
import { SearchIcon, UsersIcon } from '@/components/Icons';
import type { BuildingMember, PendingMember } from '@/components/MemberManagementPanel';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DropdownMenu from '@/components/ui/DropdownMenu';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';

interface RemovedMember {
  id: string;
  username: string;
  displayName: string;
  role: string;
  status: string;
}

interface Page<T> {
  items: T[];
  page: number;
  size: number;
  hasNext: boolean;
}

interface AdminMembersViewProps {
  buildingId: string;
  buildingName: string;
  currentAccountId: string;
  pendingMembers: PendingMember[];
  approvedMembers: BuildingMember[];
  isSyncStale: boolean;
  busy: boolean;
  refreshKey: number;
  onApproveMember: (accountId: string) => Promise<void>;
  onChangeRole: (accountId: string, role: 'MANAGER' | 'RESIDENT') => Promise<void>;
  onRefresh: () => Promise<void>;
  onSessionExpired: () => void;
}

type MemberTab = 'approved' | 'pending' | 'removed';

type PendingConfirm =
  | { type: 'promote'; member: BuildingMember }
  | { type: 'demote'; member: BuildingMember }
  | { type: 'remove'; member: BuildingMember };

export default function AdminMembersView({
  buildingId,
  buildingName,
  currentAccountId,
  pendingMembers,
  approvedMembers,
  isSyncStale,
  busy,
  refreshKey,
  onApproveMember,
  onChangeRole,
  onRefresh,
  onSessionExpired,
}: AdminMembersViewProps) {
  const [tab, setTab] = useState<MemberTab>('approved');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'MANAGER' | 'RESIDENT'>('ALL');
  const [removed, setRemoved] = useState<RemovedMember[]>([]);
  const [removedPage, setRemovedPage] = useState(0);
  const [removedHasNext, setRemovedHasNext] = useState(false);
  const [removedBusy, setRemovedBusy] = useState(false);
  const [confirmState, setConfirmState] = useState<PendingConfirm | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const mounted = useRef(false);
  const callbacks = useRef({ onRefresh, onSessionExpired });

  useEffect(() => {
    callbacks.current = { onRefresh, onSessionExpired };
  }, [onRefresh, onSessionExpired]);

  async function loadRemoved(targetPage: number, signal?: AbortSignal) {
    setRemovedBusy(true);
    try {
      const res = await fetch(`/api/buildings/${buildingId}/members/removed?page=${targetPage}&size=20`, {
        cache: 'no-store',
        signal,
      });
      if (!mounted.current || signal?.aborted) return;
      if (res.status === 401) {
        callbacks.current.onSessionExpired();
        return;
      }
      if (!res.ok) throw new Error('Không tải được danh sách thành viên đã gỡ.');
      const data = (await res.json()) as Page<RemovedMember>;
      if (!mounted.current || signal?.aborted) return;
      setRemoved(data.items);
      setRemovedPage(data.page);
      setRemovedHasNext(data.hasNext);
      setError('');
    } catch (err) {
      if (mounted.current && !signal?.aborted) {
        setError(err instanceof Error ? err.message : 'Không tải được dữ liệu.');
      }
    } finally {
      if (mounted.current) setRemovedBusy(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    if (tab === 'removed') {
      void Promise.resolve().then(() => {
        if (mounted.current && !controller.signal.aborted) {
          return loadRemoved(removedPage, controller.signal);
        }
      });
    }
    return () => {
      mounted.current = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingId, tab, refreshKey]);

  const managerCount = approvedMembers.filter((m) => m.role === 'MANAGER').length;
  const query = search.trim().toLowerCase();
  const filteredApproved = approvedMembers.filter((m) => {
    if (roleFilter !== 'ALL' && m.role !== roleFilter) return false;
    if (!query) return true;
    return (
      m.displayName.toLowerCase().includes(query) ||
      m.username.toLowerCase().includes(query)
    );
  });

  const disabled = busy || isSyncStale || actionBusy;

  async function handleConfirm() {
    if (!confirmState || disabled) return;
    setActionBusy(true);
    setError('');
    setNotice('');
    try {
      if (confirmState.type === 'promote') {
        await onChangeRole(confirmState.member.id, 'MANAGER');
        setConfirmState(null);
        return;
      }
      if (confirmState.type === 'demote') {
        await onChangeRole(confirmState.member.id, 'RESIDENT');
        setConfirmState(null);
        return;
      }
      const res = await fetch(`/api/buildings/${buildingId}/members/${encodeURIComponent(confirmState.member.id)}`, {
        method: 'DELETE',
        cache: 'no-store',
      });
      if (res.status === 401) {
        callbacks.current.onSessionExpired();
        return;
      }
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: unknown } | null;
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : 'Không thể gỡ thành viên này (có thể cư dân đang có mẻ giặt chưa hoàn tất).',
        );
      }
      setConfirmState(null);
      setNotice(`Đã gỡ ${confirmState.member.displayName} khỏi tòa nhà.`);
      await callbacks.current.onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Thao tác không thành công.');
      setConfirmState(null);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRestore(member: RemovedMember) {
    if (disabled) return;
    setActionBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/buildings/${buildingId}/members/${encodeURIComponent(member.id)}/restore`, {
        method: 'POST',
        cache: 'no-store',
      });
      if (res.status === 401) {
        callbacks.current.onSessionExpired();
        return;
      }
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: unknown } | null;
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Không khôi phục được thành viên.');
      }
      setNotice(`Đã khôi phục ${member.displayName} về Chờ duyệt; cần duyệt riêng tại tab Chờ duyệt.`);
      await callbacks.current.onRefresh();
      await loadRemoved(removedPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không khôi phục được.');
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="view-stack">
      <header className="page-header">
        <div>
          <p className="page-kicker">{buildingName} · Quản trị</p>
          <h1 className="page-title">Quản lý thành viên</h1>
        </div>
      </header>

      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {notice && <p className="alert alert-ok" role="status">{notice}</p>}

      <section className="surface-card">
        <div className="segmented-tabs" role="tablist" aria-label="Nhóm thành viên">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'approved'}
            className={tab === 'approved' ? 'seg-tab active' : 'seg-tab'}
            onClick={() => setTab('approved')}
          >
            Đã duyệt ({approvedMembers.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'pending'}
            className={tab === 'pending' ? 'seg-tab active' : 'seg-tab'}
            onClick={() => setTab('pending')}
          >
            Chờ duyệt ({pendingMembers.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'removed'}
            className={tab === 'removed' ? 'seg-tab active' : 'seg-tab'}
            onClick={() => {
              setTab('removed');
              setRemovedPage(0);
            }}
          >
            Đã gỡ
          </button>
        </div>

        {tab === 'approved' && (
          <>
            <div className="table-toolbar">
              <div className="search-input-wrap">
                <SearchIcon size={15} className="search-input-icon" />
                <input
                  type="search"
                  className="search-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm theo tên hoặc @username..."
                  aria-label="Tìm thành viên đã duyệt"
                />
              </div>
              <select
                className="role-filter-select"
                aria-label="Lọc theo vai trò"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as 'ALL' | 'MANAGER' | 'RESIDENT')}
              >
                <option value="ALL">Tất cả vai trò ({approvedMembers.length})</option>
                <option value="MANAGER">Quản lý ({managerCount})</option>
                <option value="RESIDENT">Cư dân ({approvedMembers.length - managerCount})</option>
              </select>
            </div>

            {filteredApproved.length === 0 ? (
              <EmptyState
                compact
                icon={<UsersIcon size={22} />}
                title="Không tìm thấy thành viên"
                description="Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc vai trò."
              />
            ) : (
              <>
                <div className="data-table-wrap desktop-only-table">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Thành viên</th>
                        <th>Tên đăng nhập</th>
                        <th>Vai trò</th>
                        <th style={{ width: 64, textAlign: 'right' }}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredApproved.map((member) => {
                        const isManager = member.role === 'MANAGER';
                        const isLastManager = isManager && managerCount <= 1;
                        const isMe = member.id === currentAccountId;

                        const menuItems = isManager
                          ? [
                              {
                                label: isLastManager ? 'Quản lý duy nhất (không thể hạ)' : 'Hạ về Cư dân',
                                disabled: disabled || isLastManager,
                                onClick: () => setConfirmState({ type: 'demote', member }),
                              },
                            ]
                          : [
                              {
                                label: 'Cấp quyền Quản lý',
                                disabled,
                                onClick: () => setConfirmState({ type: 'promote', member }),
                              },
                              {
                                label: 'Gỡ khỏi tòa nhà',
                                danger: true,
                                disabled: disabled || isMe,
                                onClick: () => setConfirmState({ type: 'remove', member }),
                              },
                            ];

                        return (
                          <tr key={member.id}>
                            <td>
                              <strong>{member.displayName}</strong>
                              {isMe && <span className="me-tag"> (Bạn)</span>}
                            </td>
                            <td className="muted-cell">@{member.username}</td>
                            <td>
                              <StatusBadge tone={isManager ? 'primary' : 'neutral'}>
                                {isManager ? 'Quản lý' : 'Cư dân'}
                              </StatusBadge>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <DropdownMenu
                                label={`Thao tác cho ${member.displayName}`}
                                items={menuItems}
                                disabled={disabled}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <ul className="queue-list mobile-only-cards">
                  {filteredApproved.map((member) => {
                    const isManager = member.role === 'MANAGER';
                    const isLastManager = isManager && managerCount <= 1;
                    const isMe = member.id === currentAccountId;
                    const menuItems = isManager
                      ? [
                          {
                            label: isLastManager ? 'Quản lý duy nhất' : 'Hạ về Cư dân',
                            disabled: disabled || isLastManager,
                            onClick: () => setConfirmState({ type: 'demote', member }),
                          },
                        ]
                      : [
                          {
                            label: 'Cấp quyền Quản lý',
                            disabled,
                            onClick: () => setConfirmState({ type: 'promote', member }),
                          },
                          {
                            label: 'Gỡ khỏi tòa nhà',
                            danger: true,
                            disabled: disabled || isMe,
                            onClick: () => setConfirmState({ type: 'remove', member }),
                          },
                        ];

                    return (
                      <li key={member.id} className="queue-row">
                        <div>
                          <strong>
                            {member.displayName} {isMe && <span className="me-tag">(Bạn)</span>}
                          </strong>
                          <div className="muted-note" style={{ margin: '2px 0 6px' }}>@{member.username}</div>
                          <StatusBadge tone={isManager ? 'primary' : 'neutral'}>
                            {isManager ? 'Quản lý' : 'Cư dân'}
                          </StatusBadge>
                        </div>
                        <DropdownMenu
                          label={`Thao tác cho ${member.displayName}`}
                          items={menuItems}
                          disabled={disabled}
                        />
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </>
        )}

        {tab === 'pending' && (
          pendingMembers.length === 0 ? (
            <EmptyState
              compact
              icon={<UsersIcon size={22} />}
              title="Không có yêu cầu chờ duyệt"
              description="Các cư dân gửi yêu cầu tham gia bằng mã mời sẽ xuất hiện tại đây."
            />
          ) : (
            <ul className="queue-list">
              {pendingMembers.map((m) => (
                <li key={m.id} className="queue-row">
                  <div>
                    <strong>{m.displayName}</strong>
                    <div className="muted-note" style={{ margin: 0 }}>Đang chờ phê duyệt tham gia tòa</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={disabled}
                    onClick={() => void onApproveMember(m.id)}
                  >
                    Duyệt
                  </button>
                </li>
              ))}
            </ul>
          )
        )}

        {tab === 'removed' && (
          <>
            <p className="muted-note">
              Khôi phục thành viên chỉ đưa tài khoản về danh sách <strong>Chờ duyệt</strong>. Bạn cần duyệt lại riêng nếu muốn cấp quyền truy cập.
            </p>
            {removedBusy && removed.length === 0 ? (
              <p className="muted-note">Đang tải danh sách...</p>
            ) : removed.length === 0 ? (
              <EmptyState
                compact
                icon={<UsersIcon size={22} />}
                title="Không có thành viên đã gỡ"
                description="Các tài khoản từng bị gỡ khỏi tòa nhà sẽ hiển thị tại đây."
              />
            ) : (
              <ul className="queue-list">
                {removed.map((member) => (
                  <li key={member.id} className="queue-row">
                    <div>
                      <strong>{member.displayName}</strong>
                      <div className="muted-note" style={{ margin: 0 }}>@{member.username}</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={disabled || member.status !== 'REMOVED'}
                      onClick={() => void handleRestore(member)}
                    >
                      Khôi phục
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {(removedPage > 0 || removedHasNext) && (
              <div className="pagination-bar">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={removedBusy || removedPage === 0}
                  onClick={() => void loadRemoved(removedPage - 1)}
                >
                  Trang trước
                </button>
                <span>Trang {removedPage + 1}</span>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={removedBusy || !removedHasNext}
                  onClick={() => void loadRemoved(removedPage + 1)}
                >
                  Trang sau
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(confirmState)}
        onClose={() => setConfirmState(null)}
        onConfirm={handleConfirm}
        variant={confirmState?.type === 'promote' ? 'primary' : 'danger'}
        title={
          confirmState?.type === 'promote'
            ? `Cấp quyền Quản lý cho ${confirmState.member.displayName}?`
            : confirmState?.type === 'demote'
              ? `Hạ quyền ${confirmState.member.displayName} về Cư dân?`
              : `Gỡ ${confirmState?.member.displayName ?? ''} khỏi tòa nhà?`
        }
        description={
          confirmState?.type === 'promote'
            ? 'Thành viên này sẽ có quyền duyệt cư dân, quản lý máy, tạo/thu hồi mã mời và kiểm duyệt tin nhắn.'
            : confirmState?.type === 'demote'
              ? 'Thành viên này sẽ không còn truy cập được các mục quản trị của tòa nhà.'
              : 'Lượt chờ (WAITING) sẽ kết thúc và lượt giữ (HELD) sẽ bị hủy để cấp lại máy. Không thể gỡ nếu cư dân đang có mẻ giặt chưa hoàn tất.'
        }
        confirmLabel={
          confirmState?.type === 'promote'
            ? 'Xác nhận cấp quyền'
            : confirmState?.type === 'demote'
              ? 'Xác nhận hạ quyền'
              : 'Xác nhận gỡ'
        }
        busy={actionBusy}
      />
    </div>
  );
}
