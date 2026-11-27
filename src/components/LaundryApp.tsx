'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AuthSection from '@/components/AuthSection';
import NotificationToast from '@/components/NotificationToast';
import type { MachineHoldView } from '@/components/MachineHoldCard';
import type { BuildingMember, PendingMember } from '@/components/MemberManagementPanel';
import type { QueueParticipation } from '@/components/QueuePanel';
import type { WashCycleView } from '@/components/WashCycleCard';
import AccountProfileView from '@/components/account/AccountProfileView';
import AdminActivityView from '@/components/admin/AdminActivityView';
import AdminInvitationsView from '@/components/admin/AdminInvitationsView';
import AdminMachinesView from '@/components/admin/AdminMachinesView';
import AdminMembersView from '@/components/admin/AdminMembersView';
import AdminModerationView from '@/components/admin/AdminModerationView';
import CreateBuildingModal from '@/components/buildings/CreateBuildingModal';
import JoinBuildingModal from '@/components/buildings/JoinBuildingModal';
import ChatView from '@/components/chat/ChatView';
import { BuildingIcon, ClockIcon, PlusIcon, TicketIcon } from '@/components/Icons';
import AppShell from '@/components/layout/AppShell';
import MachinesView from '@/components/machines/MachinesView';
import OverviewView from '@/components/overview/OverviewView';
import QueueView from '@/components/queue/QueueView';
import SwapsView from '@/components/swaps/SwapsView';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { buildAppPath, isManagerView, parsePathname } from '@/lib/navigation';
import type {
  AccountView,
  AppView,
  BuildingSummary,
  BuildingView,
  MachineView,
  OperationalSnapshot,
} from '@/types/laundry';

const VALID_STATES = new Set<QueueParticipation>(['NONE', 'WAITING', 'HELD', 'WASHING']);
const POLL_INTERVAL_MS = 5000;
const REQUEST_TIMEOUT_MS = 15000;
const STORAGE_BUILDING_KEY = 'laundry_selected_building_id';

interface LaundryAppProps {
  initialBuildingId?: string;
  initialView?: AppView;
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        ok: false,
        status: 504,
        error: 'Yêu cầu quá thời gian phản hồi. Vui lòng kiểm tra kết nối và thử lại.',
      };
    }
    return {
      ok: false,
      status: 0,
      error: 'Không thể kết nối tới máy chủ. Vui lòng kiểm tra mạng và thử lại.',
    };
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (res.status === 204) {
    return { ok: true, status: 204 };
  }

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const errObj = payload as { error?: string } | null;
    return {
      ok: false,
      status: res.status,
      error: errObj?.error ?? 'Không thể hoàn tất yêu cầu.',
    };
  }

  return { ok: true, status: res.status, data: payload as T };
}

function syncBrowserUrl(buildingId: string | null, view: AppView) {
  if (typeof window === 'undefined') return;
  try {
    const targetPath = buildAppPath(buildingId, view);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ buildingId, view }, '', targetPath);
    }
  } catch {
    // Ignore history restriction in non-browser or sandboxed test environments.
  }
}

export default function LaundryApp({ initialBuildingId, initialView }: LaundryAppProps = {}) {
  const [account, setAccount] = useState<AccountView | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeView, setActiveView] = useState<AppView>(initialView ?? 'overview');
  const [refreshKey, setRefreshKey] = useState(0);

  const [buildings, setBuildings] = useState<BuildingSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialBuildingId ?? null);
  const [buildingDetail, setBuildingDetail] = useState<BuildingView | null>(null);
  const [holds, setHolds] = useState<MachineHoldView[]>([]);
  const [holdsVerified, setHoldsVerified] = useState(false);
  const [myCycles, setMyCycles] = useState<WashCycleView[] | null>(null);
  const [issues, setIssues] = useState<WashCycleView[] | null>([]);
  const [holdHandover, setHoldHandover] = useState<WashCycleView | null | undefined>(undefined);
  const [snapshotEta, setSnapshotEta] = useState<OperationalSnapshot['eta']>(undefined);
  const [serverNow, setServerNow] = useState<string | undefined>(undefined);
  const [participation, setParticipation] = useState<QueueParticipation>('UNKNOWN');
  const [verifiedHoldId, setVerifiedHoldId] = useState<string | null>(null);

  const [detailError, setDetailError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [approvedMembers, setApprovedMembers] = useState<BuildingMember[]>([]);
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedSummary = buildings.find((b) => b.id === selectedId) ?? null;
  const selectedRole = selectedSummary?.role;
  const selectedStatus = selectedSummary?.status;
  const detailRequestId = useRef(0);
  const buildingDetailFor = useRef<string | null>(null);

  const navigate = useCallback(
    (nextView: AppView, nextBuildingId: string | null = selectedId) => {
      const targetSummary = buildings.find((b) => b.id === nextBuildingId) ?? null;
      const resolvedView =
        isManagerView(nextView) && (targetSummary?.role !== 'MANAGER' || targetSummary?.status !== 'APPROVED')
          ? 'overview'
          : nextView;
      setActiveView(resolvedView);
      setError(null);
      syncBrowserUrl(nextBuildingId, resolvedView);
    },
    [buildings, selectedId],
  );

  const selectBuilding = useCallback(
    (id: string) => {
      setSelectedId(id);
      setInviteToken(null);
      try {
        window.sessionStorage.setItem(STORAGE_BUILDING_KEY, id);
      } catch {
        // Ignore storage restriction.
      }
      const nextSummary = buildings.find((b) => b.id === id);
      const nextView =
        isManagerView(activeView) && (nextSummary?.role !== 'MANAGER' || nextSummary?.status !== 'APPROVED')
          ? 'overview'
          : activeView === 'account'
            ? 'overview'
            : activeView;
      setActiveView(nextView);
      syncBrowserUrl(id, nextView);
    },
    [activeView, buildings],
  );

  const clearManagerState = useCallback(() => {
    setPendingMembers([]);
    setApprovedMembers([]);
    setInviteToken(null);
  }, []);

  const resetBuildingSnapshot = useCallback(() => {
    buildingDetailFor.current = null;
    setBuildingDetail(null);
    setHolds([]);
    setHoldsVerified(false);
    setMyCycles(null);
    setIssues([]);
    setHoldHandover(undefined);
    setSnapshotEta(undefined);
    setServerNow(undefined);
    setParticipation('UNKNOWN');
    setVerifiedHoldId(null);
    setDetailError(null);
    setSyncError(null);
    clearManagerState();
  }, [clearManagerState]);

  const handleSessionExpired = useCallback(() => {
    detailRequestId.current += 1;
    resetBuildingSnapshot();
    setAccount(null);
    setBuildings([]);
    setSelectedId(null);
    setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  }, [resetBuildingSnapshot]);

  const loadBuildings = useCallback(async () => {
    const res = await apiJson<BuildingSummary[]>('/api/buildings');
    if (res.ok && res.data) {
      setBuildings(res.data);
      let storedId: string | null = null;
      try {
        storedId = window.sessionStorage.getItem(STORAGE_BUILDING_KEY);
      } catch {
        storedId = null;
      }
      setSelectedId((prev) => {
        if (prev && res.data!.some((b) => b.id === prev)) return prev;
        if (storedId && res.data!.some((b) => b.id === storedId)) return storedId;
        const firstApproved = res.data!.find((b) => b.status === 'APPROVED');
        return firstApproved?.id ?? res.data![0]?.id ?? null;
      });
    } else if (res.status === 401) {
      handleSessionExpired();
    } else {
      setError(res.error ?? 'Không tải được danh sách tòa. Hãy thử lại.');
    }
  }, [handleSessionExpired]);

  const loadBuildingDetail = useCallback(
    async (summary: BuildingSummary | null, options?: { silent?: boolean }) => {
      const requestId = ++detailRequestId.current;
      if (!summary || summary.status !== 'APPROVED') {
        resetBuildingSnapshot();
        throw new Error('Building membership is not approved');
      }

      const isBuildingSwitch = buildingDetailFor.current !== summary.id;
      if (isBuildingSwitch) {
        resetBuildingSnapshot();
      } else if (!options?.silent) {
        setDetailError(null);
      }

      try {
        const [buildingsRes, snapshotRes] = await Promise.all([
          apiJson<BuildingSummary[]>('/api/buildings'),
          apiJson<OperationalSnapshot>(`/api/buildings/${summary.id}/snapshot`),
        ]);
        const snapshot = snapshotRes.data;
        const detailRes = { ...snapshotRes, data: snapshot?.building };
        const queueMeRes = { ...snapshotRes, data: snapshot?.queueStatus };
        const holdsRes = { ...snapshotRes, data: snapshot?.holds };
        const mineRes = { ...snapshotRes, data: snapshot?.myCycles };

        if (requestId !== detailRequestId.current) throw new Error('Refresh scope was replaced');

        if ([buildingsRes, detailRes, queueMeRes, holdsRes, mineRes].some((result) => result.status === 401)) {
          handleSessionExpired();
          return;
        }

        if (!buildingsRes.ok || !Array.isArray(buildingsRes.data)) {
          throw new Error('Failed to verify current building membership');
        }
        const latestSummary = snapshot?.membership;
        if (
          snapshotRes.ok &&
          (!snapshot ||
            snapshot.building.id !== summary.id ||
            latestSummary?.id !== summary.id ||
            latestSummary.status !== 'APPROVED' ||
            !Number.isFinite(Date.parse(snapshot.serverNow)))
        ) {
          throw new Error('Invalid operational snapshot');
        }

        if (buildingsRes.ok && Array.isArray(buildingsRes.data)) {
          setBuildings(
            buildingsRes.data.map((item) => (item.id === summary.id && latestSummary ? latestSummary : item)),
          );
          const freshSummary = latestSummary ?? buildingsRes.data.find((b) => b.id === summary.id);
          if (!freshSummary) {
            resetBuildingSnapshot();
            setDetailError('Bạn không còn quyền truy cập tòa nhà này.');
            throw new Error('Building access was removed');
          }
          if (summary.role === 'MANAGER' && freshSummary.role !== 'MANAGER') {
            clearManagerState();
            setActiveView((curr) => (isManagerView(curr) ? 'overview' : curr));
            setNotice('Vai trò của bạn đã được cập nhật thành Cư dân.');
          }
          if (freshSummary.status !== 'APPROVED') {
            resetBuildingSnapshot();
            return;
          }
        }

        if (!detailRes.ok || !detailRes.data) {
          setParticipation('UNKNOWN');
          setVerifiedHoldId(null);
          setHolds([]);
          setHoldsVerified(false);
          if (isBuildingSwitch) {
            resetBuildingSnapshot();
            setDetailError(detailRes.error ?? 'Không tải được chi tiết tòa.');
          } else {
            setSyncError('Refresh thất bại: không tải được dữ liệu tòa mới nhất. Thao tác đã tạm khóa.');
          }
          throw new Error(detailRes.error ?? 'Failed to load building detail');
        }

        buildingDetailFor.current = summary.id;
        setBuildingDetail(detailRes.data);
        setDetailError(null);

        const nextHoldsOk = holdsRes.ok && Array.isArray(holdsRes.data);
        if (!queueMeRes.ok || !queueMeRes.data || !nextHoldsOk || !mineRes.ok || !Array.isArray(mineRes.data)) {
          throw new Error('Failed to refresh queue, holds or personal wash cycles');
        }
        setMyCycles(mineRes.data);
        setHoldHandover(undefined);
        setSnapshotEta(snapshot?.eta);
        setServerNow(snapshot?.serverNow);

        const nextHolds = holdsRes.data!;
        setHolds(nextHolds);
        setHoldsVerified(true);

        const rawState = queueMeRes.data.state as QueueParticipation;
        if (!VALID_STATES.has(rawState)) {
          setParticipation('UNKNOWN');
          setVerifiedHoldId(null);
          setSyncError('Refresh thất bại: trạng thái cá nhân không xác định. Vui lòng tải lại.');
          throw new Error('Unknown participation state');
        } else if (rawState === 'WAITING') {
          const matchesQueue = Boolean(
            queueMeRes.data.queueEntryId &&
              detailRes.data.queue.some((q) => q.id === queueMeRes.data!.queueEntryId),
          );
          if (!matchesQueue) {
            setParticipation('UNKNOWN');
            setVerifiedHoldId(null);
            setSyncError('Refresh thất bại: dữ liệu hàng đợi chưa đồng bộ. Vui lòng tải lại.');
            throw new Error('Queue state mismatch');
          }
          setParticipation('WAITING');
          setVerifiedHoldId(null);
          setSyncError(null);
        } else if (rawState === 'HELD') {
          const matchedHold = queueMeRes.data.holdId
            ? nextHolds.find((h) => h.id === queueMeRes.data!.holdId)
            : null;
          if (!matchedHold) {
            setParticipation('UNKNOWN');
            setVerifiedHoldId(null);
            setSyncError('Refresh thất bại: dữ liệu lượt giữ máy chưa đồng bộ. Vui lòng tải lại.');
            throw new Error('Hold state mismatch');
          }
          if (snapshot?.previousCycle === undefined) throw new Error('Unverified previous wash handover');
          setHoldHandover(snapshot.previousCycle);
          setParticipation('HELD');
          setVerifiedHoldId(matchedHold.id);
          setSyncError(null);
        } else {
          setParticipation(rawState);
          setVerifiedHoldId(null);
          setSyncError(null);
        }

        if (latestSummary?.role === 'MANAGER' && latestSummary.status === 'APPROVED') {
          const [pendingRes, membersRes, issuesRes] = await Promise.all([
            apiJson<PendingMember[]>(`/api/buildings/${summary.id}/members/pending`),
            apiJson<BuildingMember[]>(`/api/buildings/${summary.id}/members`),
            apiJson<WashCycleView[]>(`/api/buildings/${summary.id}/wash-cycles/issues`),
          ]);
          if (requestId !== detailRequestId.current) throw new Error('Refresh scope was replaced');

          if ([pendingRes, membersRes, issuesRes].some((r) => r.status === 401)) {
            handleSessionExpired();
            return;
          }
          if ([pendingRes, membersRes, issuesRes].some((r) => r.status === 403)) {
            clearManagerState();
            setIssues([]);
            setActiveView((curr) => (isManagerView(curr) ? 'overview' : curr));
            setBuildings((prev) =>
              prev.map((item) => (item.id === summary.id ? { ...item, role: 'RESIDENT' } : item)),
            );
            setNotice('Bạn không còn quyền quản lý tại tòa này.');
            throw new Error('Manager authority changed during refresh');
          }

          if (
            !pendingRes.ok ||
            !Array.isArray(pendingRes.data) ||
            !membersRes.ok ||
            !Array.isArray(membersRes.data) ||
            !issuesRes.ok ||
            !Array.isArray(issuesRes.data)
          ) {
            throw new Error('Failed to refresh manager members or wash issues');
          }
          setIssues(issuesRes.data);
          setPendingMembers(pendingRes.data);
          setApprovedMembers(membersRes.data);
        } else {
          clearManagerState();
          setIssues([]);
        }
        setRefreshKey((value) => value + 1);
      } catch (err) {
        if (requestId === detailRequestId.current) {
          setParticipation('UNKNOWN');
          setVerifiedHoldId(null);
          setHolds([]);
          setHoldsVerified(false);
          setMyCycles(null);
          setIssues(null);
          setHoldHandover(undefined);
          if (!options?.silent && isBuildingSwitch) {
            resetBuildingSnapshot();
            setDetailError('Kết nối bị gián đoạn. Hãy thử tải lại dữ liệu tòa.');
          } else {
            setSyncError(
              'Refresh thất bại: kết nối bị gián đoạn, dữ liệu hiện tại có thể đã cũ. Các thao tác đã tạm khóa.',
            );
          }
        }
        throw err;
      }
    },
    [clearManagerState, handleSessionExpired, resetBuildingSnapshot],
  );

  const refreshSelectedBuilding = useCallback(async () => {
    if (!selectedId || !selectedRole || selectedStatus !== 'APPROVED') {
      throw new Error('Building scope is not authorized');
    }
    await loadBuildingDetail({ id: selectedId, name: '', role: selectedRole, status: selectedStatus });
  }, [selectedId, selectedRole, selectedStatus, loadBuildingDetail]);

  useEffect(() => {
    const onPopState = () => {
      const parsed = parsePathname(window.location.pathname);
      if (parsed.buildingId) setSelectedId(parsed.buildingId);
      setActiveView(parsed.view);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const meRes = await apiJson<AccountView>('/api/me');
      if (!active) return;
      if (meRes.ok && meRes.data) {
        setAccount(meRes.data);
        await loadBuildings();
      }
      setAuthChecked(true);
    })();
    return () => {
      active = false;
    };
  }, [loadBuildings]);

  useEffect(() => {
    const summary: BuildingSummary | null =
      selectedId && selectedRole && selectedStatus
        ? { id: selectedId, name: '', role: selectedRole, status: selectedStatus }
        : null;
    void Promise.resolve().then(() => loadBuildingDetail(summary).catch(() => {}));
    return () => {
      detailRequestId.current += 1;
    };
  }, [selectedId, selectedRole, selectedStatus, loadBuildingDetail]);

  const effectiveView: AppView =
    selectedSummary &&
    isManagerView(activeView) &&
    (selectedSummary.role !== 'MANAGER' || selectedSummary.status !== 'APPROVED')
      ? 'overview'
      : activeView;

  // Polling chung do component cha sở hữu khi đang mở trang
  useEffect(() => {
    if (!account || !selectedId || !selectedRole || selectedStatus !== 'APPROVED') return;

    const summary: BuildingSummary = {
      id: selectedId,
      name: '',
      role: selectedRole,
      status: selectedStatus,
    };

    let active = true;
    let running = false;
    let timer: number;
    const tick = async () => {
      if (!active || running) return;
      window.clearTimeout(timer);
      running = true;
      try {
        if (document.visibilityState === 'visible') await loadBuildingDetail(summary, { silent: true });
      } catch {
        /* loadBuildingDetail already closes stale action surfaces */
      } finally {
        running = false;
        if (active) timer = window.setTimeout(() => void tick(), POLL_INTERVAL_MS);
      }
    };
    timer = window.setTimeout(() => void tick(), POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [account, selectedId, selectedRole, selectedStatus, loadBuildingDetail]);

  const handleRegister = async (username: string, displayName: string, password: string): Promise<boolean> => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await apiJson<AccountView>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, displayName, password }),
      });
      if (!res.ok) {
        setError(res.error ?? 'Đăng ký thất bại.');
        return false;
      }
      setNotice('Đăng ký thành công. Vui lòng đăng nhập để tiếp tục.');
      return true;
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (username: string, password: string) => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await apiJson<AccountView>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok || !res.data) {
        setError(res.error ?? 'Đăng nhập thất bại.');
        return;
      }
      setAccount(res.data);
      setActiveView('overview');
      await loadBuildings();
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiJson('/api/auth/logout', { method: 'POST' });
      detailRequestId.current += 1;
      resetBuildingSnapshot();
      setAccount(null);
      setBuildings([]);
      setSelectedId(null);
      setActiveView('overview');
      try {
        window.sessionStorage.removeItem(STORAGE_BUILDING_KEY);
      } catch {
        // Ignore storage error.
      }
      setNotice('Đã đăng xuất.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateBuilding = async (name: string, machineCount: number): Promise<boolean> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiJson<BuildingView>('/api/buildings', {
        method: 'POST',
        body: JSON.stringify({ name, machineCount }),
      });
      if (!res.ok || !res.data) {
        setError(res.error ?? 'Không tạo được tòa.');
        return false;
      }
      setNotice(`Đã tạo tòa "${res.data.name}" với ${res.data.machines.length} máy.`);
      await loadBuildings();
      setSelectedId(res.data.id);
      setActiveView('overview');
      try {
        window.sessionStorage.setItem(STORAGE_BUILDING_KEY, res.data.id);
      } catch {
        // Ignore.
      }
      syncBrowserUrl(res.data.id, 'overview');
      return true;
    } finally {
      setBusy(false);
    }
  };

  const handleJoinByToken = async (token: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiJson<{ buildingId?: string; status?: string }>(
        `/api/invitations/${encodeURIComponent(token)}/join`,
        { method: 'POST' },
      );
      if (!res.ok) {
        setError(res.error ?? 'Không gửi được yêu cầu tham gia.');
        return false;
      }
      setNotice('Đã gửi yêu cầu tham gia tòa. Hãy chờ quản lý phê duyệt.');
      await loadBuildings();
      if (res.data?.buildingId) {
        setSelectedId(res.data.buildingId);
        setActiveView('overview');
      }
      return true;
    } finally {
      setBusy(false);
    }
  };

  const handleAddMachine = async (label: string): Promise<boolean> => {
    if (!selectedSummary || selectedSummary.role !== 'MANAGER') return false;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiJson<MachineView>(`/api/buildings/${selectedSummary.id}/machines`, {
        method: 'POST',
        body: JSON.stringify({ label }),
      });
      if (!res.ok || !res.data) {
        setError(res.error ?? 'Không thêm được máy.');
        return false;
      }
      setNotice(`Đã thêm "${res.data.label}".`);
      await loadBuildingDetail(selectedSummary).catch(() => {});
      return true;
    } finally {
      setBusy(false);
    }
  };

  const handleToggleMaintenance = async (machine: MachineView) => {
    if (!selectedSummary || selectedSummary.role !== 'MANAGER') return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const nextMaint = machine.status !== 'MAINTENANCE';
    try {
      const res = await apiJson<MachineView>(
        `/api/buildings/${selectedSummary.id}/machines/${machine.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ maintenance: nextMaint }),
        },
      );
      if (!res.ok) {
        setError(res.error ?? 'Không cập nhật được trạng thái bảo trì.');
        return;
      }
      setNotice(
        nextMaint
          ? `Đã chuyển "${machine.label}" sang Bảo trì.`
          : `Đã mở lại "${machine.label}". Lưu ý: trạng thái mở lại chưa xác nhận máy trống.`,
      );
      await loadBuildingDetail(selectedSummary).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const handleCreateInvite = async () => {
    if (!selectedSummary || selectedSummary.role !== 'MANAGER') return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiJson<{ token: string }>(
        `/api/buildings/${selectedSummary.id}/invitations`,
        { method: 'POST' },
      );
      if (!res.ok || !res.data) {
        setError(res.error ?? 'Không tạo được mã mời.');
        return;
      }
      setInviteToken(res.data.token);
      setNotice('Đã tạo mã mời có hiệu lực 7 ngày.');
      await loadBuildingDetail(selectedSummary).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const handleApproveMember = async (accountId: string) => {
    if (!selectedSummary || selectedSummary.role !== 'MANAGER') return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiJson(
        `/api/buildings/${selectedSummary.id}/members/${accountId}/approve`,
        { method: 'POST' },
      );
      if (!res.ok) {
        setError(res.error ?? 'Không duyệt được thành viên.');
        return;
      }
      setNotice('Đã duyệt thành viên vào tòa.');
      await loadBuildingDetail(selectedSummary).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const handleChangeMemberRole = async (accountId: string, role: 'MANAGER' | 'RESIDENT') => {
    if (!selectedSummary || selectedSummary.role !== 'MANAGER') return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiJson(
        `/api/buildings/${selectedSummary.id}/members/${accountId}/role`,
        {
          method: 'PATCH',
          body: JSON.stringify({ role }),
        },
      );
      if (!res.ok) {
        setError(res.error ?? 'Không cập nhật được vai trò thành viên.');
        return;
      }
      setNotice(role === 'MANAGER' ? 'Đã cấp quyền quản lý.' : 'Đã hạ vai trò về cư dân.');
      await loadBuildings();
      await loadBuildingDetail(selectedSummary).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  if (!authChecked) {
    return (
      <main className="shell">
        <section className="auth-loading" aria-busy="true">
          <div className="panel auth-loading-card">
            <span className="btn-spinner btn-spinner-dark" aria-hidden="true" />
            <p className="muted-note" style={{ margin: 0 }}>
              Đang kiểm tra phiên đăng nhập...
            </p>
          </div>
        </section>
      </main>
    );
  }

  if (!account) {
    return (
      <main className="shell">
        <NotificationToast message={notice} variant="success" onDismiss={() => setNotice(null)} />
        <AuthSection
          busy={busy}
          error={error}
          onLogin={handleLogin}
          onRegister={handleRegister}
          onClearMessages={() => {
            setError(null);
            setNotice(null);
          }}
        />
      </main>
    );
  }

  const isSyncStale = Boolean(syncError);
  const machineLabels = Object.fromEntries((buildingDetail?.machines ?? []).map((m) => [m.id, m.label]));
  const myHold =
    !isSyncStale && participation === 'HELD' && verifiedHoldId
      ? holds.find((item) => item.id === verifiedHoldId && item.accountId === account.id) ?? null
      : null;

  const triggerManualRefresh = () => {
    if (!selectedSummary) return;
    void loadBuildingDetail(selectedSummary).catch(() => {});
  };

  const renderMainContent = () => {
    if (effectiveView === 'account') {
      return (
        <AccountProfileView
          account={account}
          buildings={buildings}
          busy={busy}
          onSelectBuilding={selectBuilding}
          onOpenCreateBuilding={() => setCreateModalOpen(true)}
          onOpenJoinBuilding={() => setJoinModalOpen(true)}
          onLogout={() => void handleLogout()}
        />
      );
    }

    if (!selectedSummary) {
      return (
        <div className="surface-card onboarding-card">
          <EmptyState
            icon={<BuildingIcon size={28} />}
            title="Chào mừng đến với Giặt chung cư"
            description="Bạn chưa tham gia tòa nhà nào. Hãy tạo tòa nhà mới (nếu bạn là quản lý) hoặc nhập mã mời từ quản lý tòa nhà của bạn."
            action={
              <div className="action-row" style={{ justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setJoinModalOpen(true)}
                >
                  <TicketIcon size={15} />
                  <span>Tham gia bằng mã mời</span>
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setCreateModalOpen(true)}
                >
                  <PlusIcon size={15} />
                  <span>Tạo tòa nhà mới</span>
                </button>
              </div>
            }
          />
        </div>
      );
    }

    if (selectedSummary.status === 'PENDING') {
      return (
        <div className="surface-card onboarding-card">
          <EmptyState
            icon={<ClockIcon size={28} />}
            title={`${selectedSummary.name} · Đang chờ phê duyệt`}
            description="Yêu cầu tham gia tòa nhà của bạn đã được gửi. Sau khi quản lý phê duyệt, bạn sẽ xem được danh sách máy giặt, hàng đợi và trò chuyện của tòa."
            action={
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => void loadBuildings()}
                disabled={busy}
              >
                Kiểm tra lại trạng thái duyệt
              </button>
            }
          />
        </div>
      );
    }

    if (detailError) {
      return (
        <ErrorState
          title="Không tải được dữ liệu tòa nhà"
          message={detailError}
          onRetry={triggerManualRefresh}
          busy={busy}
        />
      );
    }

    if (!buildingDetail || buildingDetail.id !== selectedSummary.id) {
      return (
        <div className="view-stack">
          <SkeletonCard rows={3} />
          <SkeletonCard rows={4} />
        </div>
      );
    }

    switch (effectiveView) {
      case 'overview':
        return (
          <OverviewView
            account={account}
            summary={selectedSummary}
            building={buildingDetail}
            participation={isSyncStale ? 'UNKNOWN' : participation}
            isSyncStale={isSyncStale}
            holds={holds}
            myHold={myHold}
            holdHandover={holdHandover}
            myCycles={isSyncStale ? null : myCycles}
            pendingMembers={pendingMembers}
            issues={issues}
            serverNow={serverNow}
            eta={snapshotEta}
            onRefresh={refreshSelectedBuilding}
            onSessionExpired={handleSessionExpired}
            onNavigate={navigate}
          />
        );

      case 'machines':
        return (
          <MachinesView
            buildingId={selectedSummary.id}
            buildingName={buildingDetail.name}
            machines={buildingDetail.machines}
            holds={holds}
            holdsVerified={holdsVerified && !isSyncStale}
            isManager={selectedSummary.role === 'MANAGER'}
            onSessionExpired={handleSessionExpired}
            onNavigate={navigate}
          />
        );

      case 'queue':
        return (
          <QueueView
            buildingId={selectedSummary.id}
            buildingName={buildingDetail.name}
            accountId={account.id}
            entries={buildingDetail.queue}
            participation={isSyncStale ? 'UNKNOWN' : participation}
            isSyncStale={isSyncStale}
            refreshKey={refreshKey}
            initialEta={snapshotEta}
            onRefresh={refreshSelectedBuilding}
            onSessionExpired={handleSessionExpired}
            onNavigate={navigate}
          />
        );

      case 'swaps':
        return isSyncStale ? (
          <ErrorState
            title="Cần đồng bộ lại dữ liệu"
            message="Tạm khóa thao tác đổi lượt cho đến khi đồng bộ thành công với máy chủ."
            onRetry={triggerManualRefresh}
            busy={busy}
          />
        ) : (
          <SwapsView
            buildingId={selectedSummary.id}
            buildingName={buildingDetail.name}
            accountId={account.id}
            entries={buildingDetail.queue}
            refreshKey={refreshKey}
            onRefresh={refreshSelectedBuilding}
            onSessionExpired={handleSessionExpired}
          />
        );

      case 'chat':
        return (
          <ChatView
            buildingId={selectedSummary.id}
            buildingName={buildingDetail.name}
            accountId={account.id}
            isManager={selectedSummary.role === 'MANAGER'}
            onSessionExpired={handleSessionExpired}
          />
        );

      case 'admin-members':
        return (
          <AdminMembersView
            buildingId={selectedSummary.id}
            buildingName={buildingDetail.name}
            currentAccountId={account.id}
            pendingMembers={pendingMembers}
            approvedMembers={approvedMembers}
            isSyncStale={isSyncStale}
            busy={busy}
            refreshKey={refreshKey}
            onApproveMember={handleApproveMember}
            onChangeRole={handleChangeMemberRole}
            onRefresh={refreshSelectedBuilding}
            onSessionExpired={handleSessionExpired}
          />
        );

      case 'admin-invitations':
        return (
          <AdminInvitationsView
            buildingId={selectedSummary.id}
            buildingName={buildingDetail.name}
            isSyncStale={isSyncStale}
            busy={busy}
            inviteToken={inviteToken}
            refreshKey={refreshKey}
            onCreateInvite={handleCreateInvite}
            onClearInviteToken={() => setInviteToken(null)}
            onRefresh={refreshSelectedBuilding}
            onSessionExpired={handleSessionExpired}
          />
        );

      case 'admin-machines':
        return (
          <AdminMachinesView
            buildingId={selectedSummary.id}
            buildingName={buildingDetail.name}
            accountId={account.id}
            machines={buildingDetail.machines}
            holds={holds}
            holdsVerified={holdsVerified}
            isSyncStale={isSyncStale}
            busy={busy}
            onAddMachine={handleAddMachine}
            onToggleMaintenance={handleToggleMaintenance}
            onRefresh={refreshSelectedBuilding}
            onSessionExpired={handleSessionExpired}
          />
        );

      case 'admin-activity':
        return (
          <AdminActivityView
            buildingId={selectedSummary.id}
            buildingName={buildingDetail.name}
            machineLabels={machineLabels}
            refreshKey={refreshKey}
            onSessionExpired={handleSessionExpired}
          />
        );

      case 'admin-moderation':
        return (
          <AdminModerationView
            buildingId={selectedSummary.id}
            buildingName={buildingDetail.name}
            issues={issues}
            machineLabels={machineLabels}
            refreshKey={refreshKey}
            onRefresh={refreshSelectedBuilding}
            onSessionExpired={handleSessionExpired}
          />
        );

      default:
        return null;
    }
  };

  return (
    <>
      <NotificationToast message={notice} variant="success" onDismiss={() => setNotice(null)} />

      <AppShell
        account={account}
        buildings={buildings}
        selectedSummary={selectedSummary}
        activeView={effectiveView}
        pendingMembersCount={pendingMembers.length}
        issuesCount={issues?.length ?? 0}
        isSyncStale={isSyncStale}
        syncError={syncError}
        busy={busy}
        onSelectBuilding={selectBuilding}
        onNavigate={navigate}
        onRefresh={triggerManualRefresh}
        onOpenCreateBuilding={() => setCreateModalOpen(true)}
        onOpenJoinBuilding={() => setJoinModalOpen(true)}
        onLogout={() => void handleLogout()}
      >
        {error && (
          <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}
        {renderMainContent()}
      </AppShell>

      <CreateBuildingModal
        open={createModalOpen}
        busy={busy}
        onClose={() => setCreateModalOpen(false)}
        onCreate={handleCreateBuilding}
      />

      <JoinBuildingModal
        open={joinModalOpen}
        busy={busy}
        onClose={() => setJoinModalOpen(false)}
        onJoin={handleJoinByToken}
      />
    </>
  );
}
