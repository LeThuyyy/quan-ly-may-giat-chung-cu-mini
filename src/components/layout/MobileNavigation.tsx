'use client';

import { useState } from 'react';
import {
  ChatIcon,
  FlagIcon,
  HistoryIcon,
  HomeIcon,
  LogOutIcon,
  MenuIcon,
  QueueIcon,
  SwapIcon,
  TicketIcon,
  UserIcon,
  UsersIcon,
  WasherIcon,
  WrenchIcon,
} from '@/components/Icons';
import Modal from '@/components/ui/Modal';
import type { AccountView, AppView, BuildingSummary } from '@/types/laundry';

interface MobileNavigationProps {
  account: AccountView;
  selectedSummary: BuildingSummary | null;
  activeView: AppView;
  pendingMembersCount: number;
  issuesCount: number;
  busy: boolean;
  onNavigate: (view: AppView) => void;
  onOpenCreateBuilding: () => void;
  onOpenJoinBuilding: () => void;
  onLogout: () => void;
}

export default function MobileNavigation({
  account,
  selectedSummary,
  activeView,
  pendingMembersCount,
  issuesCount,
  busy,
  onNavigate,
  onOpenCreateBuilding,
  onOpenJoinBuilding,
  onLogout,
}: MobileNavigationProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  const isApproved = selectedSummary?.status === 'APPROVED';
  const isManager = isApproved && selectedSummary?.role === 'MANAGER';
  const isMoreActive =
    activeView === 'swaps' ||
    activeView === 'account' ||
    activeView.startsWith('admin-');

  const navigateFromDrawer = (view: AppView) => {
    setMoreOpen(false);
    onNavigate(view);
  };

  return (
    <>
      <nav className="mobile-tabbar" aria-label="Điều hướng di động">
        {isApproved ? (
          <>
            <button
              type="button"
              className={activeView === 'overview' ? 'mobile-tab active' : 'mobile-tab'}
              aria-current={activeView === 'overview' ? 'page' : undefined}
              onClick={() => onNavigate('overview')}
            >
              <HomeIcon size={19} />
              <span>Tổng quan</span>
            </button>
            <button
              type="button"
              className={activeView === 'machines' ? 'mobile-tab active' : 'mobile-tab'}
              aria-current={activeView === 'machines' ? 'page' : undefined}
              onClick={() => onNavigate('machines')}
            >
              <WasherIcon size={19} />
              <span>Máy giặt</span>
            </button>
            <button
              type="button"
              className={activeView === 'queue' ? 'mobile-tab active' : 'mobile-tab'}
              aria-current={activeView === 'queue' ? 'page' : undefined}
              onClick={() => onNavigate('queue')}
            >
              <QueueIcon size={19} />
              <span>Hàng đợi</span>
            </button>
            <button
              type="button"
              className={activeView === 'chat' ? 'mobile-tab active' : 'mobile-tab'}
              aria-current={activeView === 'chat' ? 'page' : undefined}
              onClick={() => onNavigate('chat')}
            >
              <ChatIcon size={19} />
              <span>Trò chuyện</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            className={activeView === 'overview' ? 'mobile-tab active' : 'mobile-tab'}
            onClick={() => onNavigate('overview')}
          >
            <HomeIcon size={19} />
            <span>Trang chính</span>
          </button>
        )}

        <button
          type="button"
          className={isMoreActive ? 'mobile-tab active' : 'mobile-tab'}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
        >
          <MenuIcon size={19} />
          <span>Thêm</span>
        </button>
      </nav>

      <Modal
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="Menu chức năng"
        description={`${account.displayName} (@${account.username})`}
        size="sm"
      >
        <div className="mobile-drawer-list">
          {isApproved && (
            <>
              <button
                type="button"
                className={activeView === 'swaps' ? 'drawer-item active' : 'drawer-item'}
                onClick={() => navigateFromDrawer('swaps')}
              >
                <SwapIcon size={18} />
                <span>Đổi lượt trong hàng</span>
              </button>
            </>
          )}

          {isManager && (
            <>
              <div className="drawer-section-label">Quản trị tòa nhà</div>
              <button
                type="button"
                className={activeView === 'admin-members' ? 'drawer-item active' : 'drawer-item'}
                onClick={() => navigateFromDrawer('admin-members')}
              >
                <UsersIcon size={18} />
                <span>Thành viên</span>
                {pendingMembersCount > 0 && <span className="nav-count">{pendingMembersCount}</span>}
              </button>
              <button
                type="button"
                className={activeView === 'admin-invitations' ? 'drawer-item active' : 'drawer-item'}
                onClick={() => navigateFromDrawer('admin-invitations')}
              >
                <TicketIcon size={18} />
                <span>Mã mời</span>
              </button>
              <button
                type="button"
                className={activeView === 'admin-machines' ? 'drawer-item active' : 'drawer-item'}
                onClick={() => navigateFromDrawer('admin-machines')}
              >
                <WrenchIcon size={18} />
                <span>Quản lý máy</span>
              </button>
              <button
                type="button"
                className={activeView === 'admin-activity' ? 'drawer-item active' : 'drawer-item'}
                onClick={() => navigateFromDrawer('admin-activity')}
              >
                <HistoryIcon size={18} />
                <span>Nhật ký hoạt động</span>
              </button>
              <button
                type="button"
                className={activeView === 'admin-moderation' ? 'drawer-item active' : 'drawer-item'}
                onClick={() => navigateFromDrawer('admin-moderation')}
              >
                <FlagIcon size={18} />
                <span>Kiểm duyệt &amp; sự cố</span>
                {issuesCount > 0 && <span className="nav-count">{issuesCount}</span>}
              </button>
            </>
          )}

          <div className="drawer-section-label">Tòa nhà &amp; Tài khoản</div>
          <button
            type="button"
            className="drawer-item"
            onClick={() => {
              setMoreOpen(false);
              onOpenCreateBuilding();
            }}
          >
            <span>+ Tạo tòa nhà mới</span>
          </button>
          <button
            type="button"
            className="drawer-item"
            onClick={() => {
              setMoreOpen(false);
              onOpenJoinBuilding();
            }}
          >
            <span>+ Tham gia bằng mã mời</span>
          </button>
          <button
            type="button"
            className={activeView === 'account' ? 'drawer-item active' : 'drawer-item'}
            onClick={() => navigateFromDrawer('account')}
          >
            <UserIcon size={18} />
            <span>Tài khoản</span>
          </button>
          <button
            type="button"
            className="drawer-item drawer-item-danger"
            disabled={busy}
            onClick={() => {
              setMoreOpen(false);
              onLogout();
            }}
          >
            <LogOutIcon size={18} />
            <span>Đăng xuất</span>
          </button>
        </div>
      </Modal>
    </>
  );
}
