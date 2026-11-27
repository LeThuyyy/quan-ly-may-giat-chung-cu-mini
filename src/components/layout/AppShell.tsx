'use client';

import { ReactNode, useState } from 'react';
import { AlertTriangleIcon, RefreshIcon, WasherIcon } from '@/components/Icons';
import BuildingSwitcher from '@/components/layout/BuildingSwitcher';
import MobileNavigation from '@/components/layout/MobileNavigation';
import Sidebar from '@/components/layout/Sidebar';
import { VIEW_META } from '@/lib/navigation';
import type { AccountView, AppView, BuildingSummary } from '@/types/laundry';

interface AppShellProps {
  account: AccountView;
  buildings: BuildingSummary[];
  selectedSummary: BuildingSummary | null;
  activeView: AppView;
  pendingMembersCount: number;
  issuesCount: number;
  isSyncStale: boolean;
  syncError: string | null;
  busy: boolean;
  onSelectBuilding: (id: string) => void;
  onNavigate: (view: AppView) => void;
  onRefresh: () => void;
  onOpenCreateBuilding: () => void;
  onOpenJoinBuilding: () => void;
  onLogout: () => void;
  children: ReactNode;
}

export default function AppShell({
  account,
  buildings,
  selectedSummary,
  activeView,
  pendingMembersCount,
  issuesCount,
  isSyncStale,
  syncError,
  busy,
  onSelectBuilding,
  onNavigate,
  onRefresh,
  onOpenCreateBuilding,
  onOpenJoinBuilding,
  onLogout,
  children,
}: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const viewMeta = VIEW_META[activeView];

  return (
    <div className={sidebarCollapsed ? 'app-shell sidebar-is-collapsed' : 'app-shell'}>
      <Sidebar
        account={account}
        buildings={buildings}
        selectedSummary={selectedSummary}
        activeView={activeView}
        collapsed={sidebarCollapsed}
        pendingMembersCount={pendingMembersCount}
        issuesCount={issuesCount}
        busy={busy}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        onSelectBuilding={onSelectBuilding}
        onNavigate={onNavigate}
        onOpenCreateBuilding={onOpenCreateBuilding}
        onOpenJoinBuilding={onOpenJoinBuilding}
        onLogout={onLogout}
      />

      <div className="app-main-column">
        <header className="app-topbar">
          <div className="topbar-mobile-row">
            <button
              type="button"
              className="topbar-mobile-brand"
              onClick={() => onNavigate('overview')}
            >
              <span className="brand-mark brand-mark-sm" aria-hidden="true">
                <WasherIcon size={17} />
              </span>
              <span>Giặt chung cư</span>
            </button>
            <BuildingSwitcher
              buildings={buildings}
              selectedId={selectedSummary?.id ?? null}
              onSelect={onSelectBuilding}
              onOpenCreate={onOpenCreateBuilding}
              onOpenJoin={onOpenJoinBuilding}
            />
          </div>

          <div className="topbar-desktop-row">
            <div className="topbar-breadcrumb" aria-label="Đường dẫn trang">
              {selectedSummary && activeView !== 'account' ? (
                <>
                  <span className="breadcrumb-building">{selectedSummary.name}</span>
                  <span className="breadcrumb-sep" aria-hidden="true">/</span>
                </>
              ) : null}
              <span className="breadcrumb-current">{viewMeta.label}</span>
            </div>

            <div className="topbar-actions">
              {isSyncStale && (
                <span className="sync-pill-stale" role="status">
                  <AlertTriangleIcon size={14} />
                  <span>Dữ liệu chưa đồng bộ</span>
                </span>
              )}
              {selectedSummary?.status === 'APPROVED' && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={onRefresh}
                  disabled={busy}
                >
                  <RefreshIcon size={14} />
                  <span>Làm mới</span>
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="app-content">
          {syncError && (
            <div className="alert alert-error sync-banner" role="alert">
              <span>{syncError}</span>
              {selectedSummary?.status === 'APPROVED' && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={onRefresh}
                  disabled={busy}
                >
                  Thử đồng bộ lại
                </button>
              )}
            </div>
          )}

          {children}
        </main>
      </div>

      <MobileNavigation
        account={account}
        selectedSummary={selectedSummary}
        activeView={activeView}
        pendingMembersCount={pendingMembersCount}
        issuesCount={issuesCount}
        busy={busy}
        onNavigate={onNavigate}
        onOpenCreateBuilding={onOpenCreateBuilding}
        onOpenJoinBuilding={onOpenJoinBuilding}
        onLogout={onLogout}
      />
    </div>
  );
}
