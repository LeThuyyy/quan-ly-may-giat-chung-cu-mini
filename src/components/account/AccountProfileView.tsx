'use client';

import { BuildingIcon, LogOutIcon, PlusIcon, TicketIcon, UserIcon } from '@/components/Icons';
import StatusBadge from '@/components/ui/StatusBadge';
import PushNotificationSettings from '@/components/PushNotificationSettings';
import type { AccountView, BuildingSummary } from '@/types/laundry';

interface AccountProfileViewProps {
  account: AccountView;
  buildings: BuildingSummary[];
  busy: boolean;
  onSelectBuilding: (id: string) => void;
  onOpenCreateBuilding: () => void;
  onOpenJoinBuilding: () => void;
  onLogout: () => void;
}

export default function AccountProfileView({
  account,
  buildings,
  busy,
  onSelectBuilding,
  onOpenCreateBuilding,
  onOpenJoinBuilding,
  onLogout,
}: AccountProfileViewProps) {
  return (
    <div className="view-stack">
      <header className="page-header">
        <div>
          <p className="page-kicker">Hồ sơ cá nhân</p>
          <h1 className="page-title">Tài khoản</h1>
        </div>
        <button
          type="button"
          className="btn btn-outline"
          disabled={busy}
          onClick={onLogout}
        >
          <LogOutIcon size={15} />
          <span>Đăng xuất</span>
        </button>
      </header>

      <div className="bento-2">
        <section className="surface-card" aria-label="Thông tin tài khoản">
          <h2 className="section-title-sm">
            <UserIcon size={17} /> Thông tin đăng nhập
          </h2>
          <dl className="account-dl">
            <div>
              <dt>Tên hiển thị</dt>
              <dd>{account.displayName}</dd>
            </div>
            <div>
              <dt>Tên đăng nhập</dt>
              <dd>@{account.username}</dd>
            </div>
          </dl>
        </section>

        <section className="surface-card" aria-label="Danh sách tòa nhà đã tham gia">
          <div className="section-head">
            <h2 className="section-title-sm">
              <BuildingIcon size={17} /> Tòa nhà của bạn ({buildings.length})
            </h2>
            <div className="action-row">
              <button type="button" className="btn btn-outline btn-sm" onClick={onOpenJoinBuilding}>
                <TicketIcon size={14} />
                <span>Nhập mã mời</span>
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={onOpenCreateBuilding}>
                <PlusIcon size={14} />
                <span>Tạo tòa</span>
              </button>
            </div>
          </div>

          {buildings.length === 0 ? (
            <p className="muted-note">Bạn chưa tham gia tòa nhà nào.</p>
          ) : (
            <ul className="queue-list">
              {buildings.map((b) => (
                <li key={b.id} className="queue-row">
                  <div>
                    <strong>{b.name}</strong>
                    <div className="muted-note" style={{ margin: 0 }}>
                      {b.role === 'MANAGER' ? 'Quản lý' : 'Cư dân'}
                    </div>
                  </div>
                  <div className="action-row">
                    <StatusBadge tone={b.status === 'APPROVED' ? 'success' : 'warning'}>
                      {b.status === 'APPROVED' ? 'Đã duyệt' : 'Chờ duyệt'}
                    </StatusBadge>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => onSelectBuilding(b.id)}
                    >
                      Mở
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <PushNotificationSettings key={account.id} />
    </div>
  );
}
