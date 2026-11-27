'use client';

import {
  ChatIcon,
  FlagIcon,
  HistoryIcon,
  HomeIcon,
  LogOutIcon,
  PanelCollapseIcon,
  QueueIcon,
  SwapIcon,
  TicketIcon,
  UserIcon,
  UsersIcon,
  WasherIcon,
  WrenchIcon,
} from '@/components/Icons';
import BuildingSwitcher from '@/components/layout/BuildingSwitcher';
import type { AccountView, AppView, BuildingSummary } from '@/types/laundry';

interface SidebarProps {
  account: AccountView;
  buildings: BuildingSummary[];
  selectedSummary: BuildingSummary | null;
  activeView: AppView;
  collapsed: boolean;
  pendingMembersCount: number;
  issuesCount: number;
  busy: boolean;
  onToggleCollapse: () => void;
  onSelectBuilding: (id: string) => void;
  onNavigate: (view: AppView) => void;
  onOpenCreateBuilding: () => void;
  onOpenJoinBuilding: () => void;
  onLogout: () => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function Sidebar({
  account,
  buildings,
  selectedSummary,
  activeView,
  collapsed,
  pendingMembersCount,
  issuesCount,
  busy,
  onToggleCollapse,
  onSelectBuilding,
  onNavigate,
  onOpenCreateBuilding,
  onOpenJoinBuilding,
  onLogout,
}: SidebarProps) {
  const isApproved = selectedSummary?.status === 'APPROVED';
  const isManager = isApproved && selectedSummary?.role === 'MANAGER';

  const residentNav: Array<{ view: AppView; label: string; icon: React.ReactNode }> = [
    { view: 'overview', label: 'Tổng quan', icon: <HomeIcon size={17} /> },
    { view: 'machines', label: 'Máy giặt', icon: <WasherIcon size={17} /> },
    { view: 'queue', label: 'Hàng đợi', icon: <QueueIcon size={17} /> },
    { view: 'swaps', label: 'Đổi lượt', icon: <SwapIcon size={17} /> },
    { view: 'chat', label: 'Trò chuyện', icon: <ChatIcon size={17} /> },
  ];

  const adminNav: Array<{ view: AppView; label: string; icon: React.ReactNode; badge?: number }> = [
    { view: 'admin-members', label: 'Thành viên', icon: <UsersIcon size={17} />, badge: pendingMembersCount },
    { view: 'admin-invitations', label: 'Mã mời', icon: <TicketIcon size={17} /> },
    { view: 'admin-machines', label: 'Quản lý máy', icon: <WrenchIcon size={17} /> },
    { view: 'admin-activity', label: 'Nhật ký', icon: <HistoryIcon size={17} /> },
    { view: 'admin-moderation', label: 'Kiểm duyệt', icon: <FlagIcon size={17} />, badge: issuesCount },
  ];

  return (
    <aside className={collapsed ? 'app-sidebar collapsed' : 'app-sidebar'} aria-label="Điều hướng chính">
      <div className="sidebar-brand-row">
        <button
          type="button"
          className="sidebar-brand"
          onClick={() => onNavigate('overview')}
          title="Giặt chung cư"
        >
          <span className="brand-mark brand-mark-sm" aria-hidden="true">
            <WasherIcon size={18} />
          </span>
          {!collapsed && <span className="sidebar-brand-name">Giặt chung cư</span>}
        </button>

        <button
          type="button"
          className="ui-icon-btn sidebar-collapse-btn"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
          title={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
        >
          <PanelCollapseIcon size={16} />
        </button>
      </div>

      <div className="sidebar-switcher-slot">
        <BuildingSwitcher
          buildings={buildings}
          selectedId={selectedSummary?.id ?? null}
          collapsed={collapsed}
          onSelect={onSelectBuilding}
          onOpenCreate={onOpenCreateBuilding}
          onOpenJoin={onOpenJoinBuilding}
        />
      </div>

      <nav className="sidebar-nav" aria-label="Chức năng tòa nhà">
        {isApproved && (
          <div className="nav-group">
            {!collapsed && <div className="nav-group-label">Cư dân</div>}
            {residentNav.map((item) => {
              const active = activeView === item.view;
              return (
                <button
                  key={item.view}
                  type="button"
                  className={active ? 'nav-item active' : 'nav-item'}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onNavigate(item.view)}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="nav-item-icon" aria-hidden="true">{item.icon}</span>
                  {!collapsed && <span className="nav-item-label">{item.label}</span>}
                </button>
              );
            })}
          </div>
        )}

        {isManager && (
          <div className="nav-group">
            {!collapsed && <div className="nav-group-label">Quản trị tòa nhà</div>}
            {adminNav.map((item) => {
              const active = activeView === item.view;
              return (
                <button
                  key={item.view}
                  type="button"
                  className={active ? 'nav-item active' : 'nav-item'}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onNavigate(item.view)}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="nav-item-icon" aria-hidden="true">{item.icon}</span>
                  {!collapsed && (
                    <>
                      <span className="nav-item-label">{item.label}</span>
                      {typeof item.badge === 'number' && item.badge > 0 && (
                        <span className="nav-count">{item.badge}</span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className={activeView === 'account' ? 'profile-btn active' : 'profile-btn'}
          aria-current={activeView === 'account' ? 'page' : undefined}
          onClick={() => onNavigate('account')}
          title={`${account.displayName} (@${account.username})`}
        >
          <span className="avatar-circle" aria-hidden="true">{getInitials(account.displayName)}</span>
          {!collapsed && (
            <span className="profile-meta">
              <strong className="profile-name">{account.displayName}</strong>
              <span className="profile-handle">@{account.username}</span>
            </span>
          )}
        </button>

        <div className="sidebar-footer-actions">
          {!collapsed && (
            <button
              type="button"
              className="nav-item nav-item-subtle"
              onClick={() => onNavigate('account')}
            >
              <span className="nav-item-icon" aria-hidden="true"><UserIcon size={16} /></span>
              <span className="nav-item-label">Tài khoản</span>
            </button>
          )}
          <button
            type="button"
            className="nav-item nav-item-subtle nav-item-danger"
            onClick={onLogout}
            disabled={busy}
            title={collapsed ? 'Đăng xuất' : undefined}
          >
            <span className="nav-item-icon" aria-hidden="true"><LogOutIcon size={16} /></span>
            {!collapsed && <span className="nav-item-label">Đăng xuất</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}
