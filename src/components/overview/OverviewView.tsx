'use client';

import Link from 'next/link';
import {
  FlagIcon,
  QueueIcon,
  ShieldIcon,
  UsersIcon,
  WasherIcon,
  WrenchIcon,
} from '@/components/Icons';
import type { MachineHoldView } from '@/components/MachineHoldCard';
import type { PendingMember } from '@/components/MemberManagementPanel';
import type { QueueParticipation } from '@/components/QueuePanel';
import type { QueueEstimateView } from '@/components/QueueEstimate';
import type { WashCycleView } from '@/components/WashCycleCard';
import MyLaundryCard from '@/components/overview/MyLaundryCard';
import StatusBadge from '@/components/ui/StatusBadge';
import type { AccountView, AppView, BuildingSummary, BuildingView } from '@/types/laundry';

interface OverviewViewProps {
  account: AccountView;
  summary: BuildingSummary;
  building: BuildingView;
  participation: QueueParticipation;
  isSyncStale: boolean;
  holds: MachineHoldView[];
  myHold: MachineHoldView | null;
  holdHandover: WashCycleView | null | undefined;
  myCycles: WashCycleView[] | null;
  pendingMembers: PendingMember[];
  issues: WashCycleView[] | null;
  serverNow?: string;
  eta?: QueueEstimateView;
  onRefresh: () => Promise<void>;
  onSessionExpired: () => void;
  onNavigate: (view: AppView) => void;
}

const MACHINE_STATUS_UI = {
  AVAILABLE: { label: 'Không bảo trì', tone: 'primary' as const },
  RUNNING: { label: 'Đang giặt', tone: 'info' as const },
  NEEDS_CHECK: { label: 'Cần kiểm tra', tone: 'warning' as const },
  MAINTENANCE: { label: 'Đang bảo trì', tone: 'neutral' as const },
};

export default function OverviewView({
  account,
  summary,
  building,
  participation,
  isSyncStale,
  holds,
  myHold,
  holdHandover,
  myCycles,
  pendingMembers,
  issues,
  serverNow,
  eta,
  onRefresh,
  onSessionExpired,
  onNavigate,
}: OverviewViewProps) {
  const isManager = summary.role === 'MANAGER';
  const machineLabels = Object.fromEntries(building.machines.map((m) => [m.id, m.label]));

  const totalMachines = building.machines.length;
  const nonMaintenanceCount = building.machines.filter((m) => m.status !== 'MAINTENANCE').length;
  const runningCount = building.machines.filter((m) => m.status === 'RUNNING').length;
  const maintenanceCount = building.machines.filter((m) => m.status === 'MAINTENANCE').length;
  const needsCheckCount = building.machines.filter((m) => m.status === 'NEEDS_CHECK').length;
  const readyQueueCount = building.queue.filter((q) => q.ready).length;
  const issueCount = issues?.length ?? 0;

  const heldMachineIds = new Set(holds.map((h) => h.machineId));
  const previewMachines = building.machines.slice(0, 6);

  return (
    <div className="view-stack">
      <header className="page-header">
        <div>
          <p className="page-kicker">
            Xin chào, {account.displayName} · {isManager ? 'Quản lý tòa nhà' : 'Cư dân'}
          </p>
          <h1 className="page-title">{building.name}</h1>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => onNavigate('machines')}
          >
            <WasherIcon size={15} />
            <span>Xem máy giặt</span>
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => onNavigate('queue')}
          >
            <QueueIcon size={15} />
            <span>Hàng đợi</span>
          </button>
        </div>
      </header>

      <section className="metrics-grid" aria-label="Chỉ số tổng quan">
        <div className="metric-card">
          <span className="metric-label">Tổng số máy</span>
          <strong className="metric-value tabular">{totalMachines}</strong>
          <span className="metric-sub">{nonMaintenanceCount} máy không bảo trì</span>
        </div>

        <div className="metric-card">
          <span className="metric-label">Đang hoạt động</span>
          <strong className="metric-value tabular">{runningCount}</strong>
          <span className="metric-sub">
            {holds.length > 0 ? `${holds.length} máy đang giữ lượt` : 'Theo trạng thái ghi nhận'}
          </span>
        </div>

        <div className="metric-card">
          <span className="metric-label">Hàng đợi</span>
          <strong className="metric-value tabular">{building.queue.length}</strong>
          <span className="metric-sub">{readyQueueCount} người đang sẵn sàng</span>
        </div>

        <div className="metric-card">
          <span className="metric-label">{isManager ? 'Cần quản lý xử lý' : 'Bảo trì / kiểm tra'}</span>
          <strong className="metric-value tabular">
            {isManager ? pendingMembers.length + issueCount + needsCheckCount : maintenanceCount + needsCheckCount}
          </strong>
          <span className="metric-sub">
            {isManager
              ? `${pendingMembers.length} chờ duyệt · ${issueCount + needsCheckCount} máy/mẻ`
              : `${maintenanceCount} bảo trì · ${needsCheckCount} cần kiểm tra`}
          </span>
        </div>
      </section>

      <MyLaundryCard
        buildingId={summary.id}
        accountId={account.id}
        participation={participation}
        isSyncStale={isSyncStale}
        entries={building.queue}
        myHold={myHold}
        holdHandover={holdHandover}
        myCycles={myCycles}
        machineLabels={machineLabels}
        serverNow={serverNow}
        eta={eta}
        onRefresh={onRefresh}
        onSessionExpired={onSessionExpired}
        onNavigate={onNavigate}
      />

      <div className={isManager ? 'overview-columns' : 'overview-single'}>
        <section className="surface-card" aria-label="Tóm tắt máy giặt">
          <div className="section-head">
            <div>
              <h2 className="section-title-sm">Trạng thái máy giặt</h2>
              <p className="muted-note" style={{ margin: 0 }}>
                Luôn kiểm tra lồng giặt thực tế tại máy trước khi sử dụng.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onNavigate('machines')}
            >
              Xem tất cả ({totalMachines})
            </button>
          </div>

          {previewMachines.length === 0 ? (
            <p className="muted-note">Tòa nhà chưa có máy giặt nào.</p>
          ) : (
            <ul className="preview-machine-list">
              {previewMachines.map((machine) => {
                const isHeld = heldMachineIds.has(machine.id);
                const ui = isHeld
                  ? { label: 'Đang giữ lượt', tone: 'warning' as const }
                  : MACHINE_STATUS_UI[machine.status];
                return (
                  <li key={machine.id} className="preview-machine-row">
                    <Link
                      href={`/buildings/${summary.id}/machines/${machine.id}`}
                      className="preview-machine-link"
                    >
                      <span className="preview-machine-name">
                        <WasherIcon size={16} />
                        <strong>{machine.label}</strong>
                      </span>
                      <StatusBadge tone={ui.tone}>{ui.label}</StatusBadge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {isManager && (
          <section className="surface-card" aria-label="Tổng quan quản lý">
            <div className="section-head">
              <div>
                <h2 className="section-title-sm">
                  <ShieldIcon size={17} /> Việc quản lý cần chú ý
                </h2>
                <p className="muted-note" style={{ margin: 0 }}>
                  Truy cập nhanh các khu vực quản trị của {building.name}.
                </p>
              </div>
            </div>

            <div className="manager-alert-list">
              <button
                type="button"
                className="manager-alert-item"
                onClick={() => onNavigate('admin-members')}
              >
                <span className="manager-alert-left">
                  <UsersIcon size={16} />
                  <span>Yêu cầu tham gia chờ duyệt</span>
                </span>
                <StatusBadge tone={pendingMembers.length > 0 ? 'warning' : 'neutral'}>
                  {pendingMembers.length}
                </StatusBadge>
              </button>

              <button
                type="button"
                className="manager-alert-item"
                onClick={() => onNavigate('admin-machines')}
              >
                <span className="manager-alert-left">
                  <WrenchIcon size={16} />
                  <span>Máy cần kiểm tra / đang bảo trì</span>
                </span>
                <StatusBadge tone={needsCheckCount > 0 ? 'warning' : 'neutral'}>
                  {needsCheckCount + maintenanceCount}
                </StatusBadge>
              </button>

              <button
                type="button"
                className="manager-alert-item"
                onClick={() => onNavigate('admin-moderation')}
              >
                <span className="manager-alert-left">
                  <FlagIcon size={16} />
                  <span>Mẻ giặt có sự cố cần xử lý</span>
                </span>
                <StatusBadge tone={issueCount > 0 ? 'error' : 'neutral'}>
                  {issueCount}
                </StatusBadge>
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
