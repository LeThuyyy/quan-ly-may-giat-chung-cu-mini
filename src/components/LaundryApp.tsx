'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import AuthSection from '@/components/AuthSection';
import BuildingAdminPanel from '@/components/BuildingAdminPanel';
import ConfirmMachineFreeButton from '@/components/ConfirmMachineFreeButton';
import MachineHoldCard, { MachineHoldView } from '@/components/MachineHoldCard';
import MemberManagementPanel, { BuildingMember, PendingMember } from '@/components/MemberManagementPanel';
import QueuePanel, { QueueEntryView, QueueParticipation } from '@/components/QueuePanel';
import WashCycleCard, { WashCycleView } from '@/components/WashCycleCard';
import WashHoldActions from '@/components/WashHoldActions';
import WashManagerPanel from '@/components/WashManagerPanel';
import ChatPanel from '@/components/ChatPanel';
import QueueEstimate from '@/components/QueueEstimate';
import QueueSwapPanel from '@/components/QueueSwapPanel';
import Link from 'next/link';

interface AccountView {
  id: string;
  username: string;
  displayName: string;
}

interface BuildingSummary {
  id: string;
  name: string;
  role: 'MANAGER' | 'RESIDENT';
  status: 'PENDING' | 'APPROVED';
}

interface MachineView {
  id: string;
  label: string;
  status: 'AVAILABLE' | 'MAINTENANCE' | 'RUNNING' | 'NEEDS_CHECK';
}

interface BuildingView {
  id: string;
  name: string;
  machines: MachineView[];
  queue: QueueEntryView[];
}

interface QueueMeResponse {
  state: string;
  queueEntryId: string | null;
  ready: boolean | null;
  holdId: string | null;
  machineId: string | null;
  expiresAt: string | null;
  serverNow: string;
}

interface OperationalSnapshot {
  building: BuildingView;
  membership: BuildingSummary;
  queueStatus: QueueMeResponse;
  holds: MachineHoldView[];
  myCycles: WashCycleView[];
  previousCycle: WashCycleView | null;
  serverNow: string;
}

const VALID_STATES = new Set<QueueParticipation>(['NONE', 'WAITING', 'HELD', 'WASHING']);
const POLL_INTERVAL_MS = 5000;

async function apiJson<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });

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

export default function LaundryApp() {
  const [account, setAccount] = useState<AccountView | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [section, setSection] = useState<'laundry' | 'chat'>('laundry');
  const [refreshKey, setRefreshKey] = useState(0);

  const [buildings, setBuildings] = useState<BuildingSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [buildingDetail, setBuildingDetail] = useState<BuildingView | null>(null);
  const [holds, setHolds] = useState<MachineHoldView[]>([]);
  const [holdsVerified, setHoldsVerified] = useState(false);
  const [myCycles, setMyCycles] = useState<WashCycleView[] | null>(null);
  const [issues, setIssues] = useState<WashCycleView[] | null>([]);
  const [holdHandover, setHoldHandover] = useState<WashCycleView | null | undefined>(undefined);
  const [serverNow, setServerNow] = useState<string | undefined>(undefined);
  const [participation, setParticipation] = useState<QueueParticipation>('UNKNOWN');
  const [verifiedHoldId, setVerifiedHoldId] = useState<string | null>(null);

  const [detailError, setDetailError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [approvedMembers, setApprovedMembers] = useState<BuildingMember[]>([]);
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  const [newBuildingName, setNewBuildingName] = useState('');
  const [machineCount, setMachineCount] = useState(2);
  const [joinTokenInput, setJoinTokenInput] = useState('');
  const [newMachineLabel, setNewMachineLabel] = useState('');

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedSummary = buildings.find((b) => b.id === selectedId) ?? null;
  const selectedRole = selectedSummary?.role;
  const selectedStatus = selectedSummary?.status;
  const detailRequestId = useRef(0);
  const buildingDetailFor = useRef<string | null>(null);

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
      setSelectedId((prev) => {
        if (prev && res.data!.some((b) => b.id === prev)) return prev;
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
        // Keep stale-state guards until the required server reads succeed.
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
        if (snapshotRes.ok && (!snapshot || snapshot.building.id !== summary.id || latestSummary?.id !== summary.id
          || latestSummary.status !== 'APPROVED' || !Number.isFinite(Date.parse(snapshot.serverNow)))) {
          throw new Error('Invalid operational snapshot');
        }
        // Cập nhật lại vai trò và trạng thái thành viên mới nhất từ server
        if (buildingsRes.ok && Array.isArray(buildingsRes.data)) {
          setBuildings(buildingsRes.data.map(item => item.id === summary.id && latestSummary ? latestSummary : item));
          const freshSummary = latestSummary ?? buildingsRes.data.find((b) => b.id === summary.id);
          if (!freshSummary) {
            resetBuildingSnapshot();
            setDetailError('Bạn không còn quyền truy cập tòa nhà này.');
            throw new Error('Building access was removed');
          }
          if (summary.role === 'MANAGER' && freshSummary.role !== 'MANAGER') {
            clearManagerState();
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

        // Nếu queue/me hoặc holds lỗi: khóa thao tác, báo refresh thất bại, không coi dữ liệu cũ là đã cập nhật
        const nextHoldsOk = holdsRes.ok && Array.isArray(holdsRes.data);
        if (!queueMeRes.ok || !queueMeRes.data || !nextHoldsOk || !mineRes.ok || !Array.isArray(mineRes.data)) {
          throw new Error('Failed to refresh queue, holds or personal wash cycles');
        }
        setMyCycles(mineRes.data);
        setHoldHandover(undefined);
        setServerNow(snapshot?.serverNow);

        const nextHolds = holdsRes.data!;
        setHolds(nextHolds);
        setHoldsVerified(true);

        // Xác minh trạng thái yêu cầu cá nhân theo hợp đồng api-trang-thai-ca-nhan.md
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
          // NONE hoặc WASHING
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

          // Nếu bị quản lý khác hạ quyền đúng lúc gọi API quản lý -> tự hạ vai trò về RESIDENT và ẩn nút quản lý
          if ([pendingRes, membersRes, issuesRes].some((result) => result.status === 401)) {
            handleSessionExpired();
            throw new Error('Session expired while loading manager data');
          }
          if (pendingRes.status === 403 || membersRes.status === 403 || issuesRes.status === 403) {
            setIssues([]);
            clearManagerState();
            setBuildings((prev) =>
              prev.map((item) => (item.id === summary.id ? { ...item, role: 'RESIDENT' } : item)),
            );
            setNotice('Bạn không còn quyền quản lý tại tòa này.');
            throw new Error('Manager authority changed during refresh');
          }

          if (!pendingRes.ok || !Array.isArray(pendingRes.data) || !membersRes.ok || !Array.isArray(membersRes.data)
            || !issuesRes.ok || !Array.isArray(issuesRes.data)) {
            throw new Error('Failed to refresh manager members or wash issues');
          }
          setIssues(issuesRes.data);
          if (pendingRes.ok && pendingRes.data) {
            setPendingMembers(pendingRes.data);
          } else if (!options?.silent) {
            setError(pendingRes.error ?? 'Không tải được danh sách chờ duyệt.');
          }
          if (membersRes.ok && membersRes.data) {
            setApprovedMembers(membersRes.data);
          } else if (!options?.silent) {
            setError(membersRes.error ?? 'Không tải được danh sách thành viên.');
          }
        } else {
          clearManagerState();
          setIssues([]);
        }
        setRefreshKey(value => value + 1);
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
    if (!selectedId || !selectedRole || selectedStatus !== 'APPROVED') throw new Error('Building scope is not authorized');
    await loadBuildingDetail({ id: selectedId, name: '', role: selectedRole, status: selectedStatus });
  }, [selectedId, selectedRole, selectedStatus, loadBuildingDetail]);

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
      } catch { /* loadBuildingDetail already closes stale action surfaces */ }
      finally {
        running = false;
        if (active) timer = window.setTimeout(() => void tick(), POLL_INTERVAL_MS);
      }
    };
    timer = window.setTimeout(() => void tick(), POLL_INTERVAL_MS);
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') void tick(); };
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
      setNotice('Đã đăng xuất.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateBuilding = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiJson<BuildingView>('/api/buildings', {
        method: 'POST',
        body: JSON.stringify({ name: newBuildingName, machineCount: Number(machineCount) }),
      });
      if (!res.ok || !res.data) {
        setError(res.error ?? 'Không tạo được tòa.');
        return;
      }
      setNewBuildingName('');
      setNotice(`Đã tạo tòa "${res.data.name}" với ${res.data.machines.length} máy.`);
      await loadBuildings();
      setSelectedId(res.data.id);
    } finally {
      setBusy(false);
    }
  };

  const handleJoinByToken = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const token = joinTokenInput.trim();
      const res = await apiJson<{ buildingId: string; status: 'PENDING' | 'APPROVED' }>(
        `/api/invitations/${encodeURIComponent(token)}/join`,
        { method: 'POST' },
      );
      if (!res.ok || !res.data) {
        setError(res.error ?? 'Không gửi được yêu cầu tham gia.');
        return;
      }
      setJoinTokenInput('');
      setNotice(
        res.data.status === 'APPROVED'
          ? 'Bạn đã là thành viên được duyệt của tòa này.'
          : 'Đã gửi yêu cầu tham gia. Vui lòng chờ quản lý duyệt.',
      );
      await loadBuildings();
      setSelectedId(res.data.buildingId);
    } finally {
      setBusy(false);
    }
  };

  const handleAddMachine = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedSummary || syncError) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiJson<MachineView>(`/api/buildings/${selectedSummary.id}/machines`, {
        method: 'POST',
        body: JSON.stringify({ label: newMachineLabel }),
      });
      if (!res.ok) {
        setError(res.error ?? 'Không thêm được máy.');
        return;
      }
      setNewMachineLabel('');
      await loadBuildingDetail(selectedSummary).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const handleToggleMaintenance = async (machine: MachineView) => {
    if (!selectedSummary || syncError) return;
    setBusy(true);
    setError(null);
    try {
      const nextMaintenance = machine.status !== 'MAINTENANCE';
      const res = await apiJson(`/api/buildings/${selectedSummary.id}/machines/${machine.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ maintenance: nextMaintenance }),
      });
      if (!res.ok) {
        setError(res.error ?? 'Không cập nhật được trạng thái máy.');
        return;
      }
      await loadBuildingDetail(selectedSummary).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const handleCreateInvite = async () => {
    if (!selectedSummary || syncError) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiJson<{ token: string }>(`/api/buildings/${selectedSummary.id}/invitations`, {
        method: 'POST',
      });
      if (!res.ok || !res.data) {
        setError(res.error ?? 'Không tạo được mã mời.');
        return;
      }
      setInviteToken(res.data.token);
    } finally {
      setBusy(false);
    }
  };

  const handleApproveMember = async (accountId: string) => {
    if (!selectedSummary || syncError) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiJson(`/api/buildings/${selectedSummary.id}/members/${accountId}/approve`, {
        method: 'POST',
      });
      if (!res.ok) {
        setError(res.error ?? 'Không duyệt được thành viên.');
        return;
      }
      await loadBuildingDetail(selectedSummary).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const handleChangeMemberRole = async (accountId: string, role: 'MANAGER' | 'RESIDENT') => {
    if (!selectedSummary || syncError) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiJson(`/api/buildings/${selectedSummary.id}/members/${accountId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
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

  const isSyncStale = Boolean(syncError);
  const actionsDisabled = busy || isSyncStale;
  const machineLabels = Object.fromEntries((buildingDetail?.machines ?? []).map(m => [m.id, m.label]));

  const myHold =
    !isSyncStale && participation === 'HELD' && verifiedHoldId
      ? holds.find((item) => item.id === verifiedHoldId && item.accountId === account?.id) ?? null
      : null;

  return (
    <main className="shell">
      <header className="topbar">
        <span className="mark" aria-hidden="true">◉</span>
        <span>GIẶT CHUNG CƯ</span>
        {account ? (
          <div className="topbar-user">
            <span className="badge">{account.displayName} (@{account.username})</span>
            <button type="button" className="btn btn-outline" onClick={handleLogout} disabled={busy}>
              Đăng xuất
            </button>
          </div>
        ) : (
          <span className="badge">KẾT NỐI JAVA API</span>
        )}
      </header>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert alert-ok" role="status">
          {notice}
        </div>
      )}

      {!authChecked ? (
        <section className="panel">
          <p>Đang kiểm tra phiên đăng nhập...</p>
        </section>
      ) : !account ? (
        <AuthSection
          busy={busy}
          onLogin={handleLogin}
          onRegister={handleRegister}
          onClearMessages={() => {
            setError(null);
            setNotice(null);
          }}
        />
      ) : (
        <section className="workspace">
          <aside className="sidebar">
            <div className="panel">
              <h2>Tòa nhà của bạn</h2>
              {buildings.length === 0 ? (
                <p className="muted-note">Bạn chưa tham gia tòa nào.</p>
              ) : (
                <ul className="building-list">
                  {buildings.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        className={b.id === selectedId ? 'building-item active' : 'building-item'}
                        onClick={() => {
                          setSelectedId(b.id);
                          setInviteToken(null);
                        }}
                      >
                        <strong>{b.name}</strong>
                        <span>
                          {b.role === 'MANAGER' ? 'Quản lý' : 'Cư dân'} ·{' '}
                          {b.status === 'APPROVED' ? 'Đã duyệt' : 'Chờ duyệt'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <form className="panel" onSubmit={handleCreateBuilding}>
              <h3>Tạo tòa mới (Quản lý)</h3>
              <label className="field">
                <span>Tên tòa</span>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={newBuildingName}
                  onChange={(e) => setNewBuildingName(e.target.value)}
                  placeholder="vd: Chung cư Mini A"
                />
              </label>
              <label className="field">
                <span>Số máy giặt (1–30)</span>
                <input
                  type="number"
                  required
                  min={1}
                  max={30}
                  value={machineCount}
                  onChange={(e) => setMachineCount(Number(e.target.value))}
                />
              </label>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Tạo tòa
              </button>
            </form>

            <form className="panel" onSubmit={handleJoinByToken}>
              <h3>Tham gia bằng mã mời</h3>
              <label className="field">
                <span>Mã mời (64 ký tự hex)</span>
                <input
                  type="text"
                  required
                  value={joinTokenInput}
                  onChange={(e) => setJoinTokenInput(e.target.value)}
                  placeholder="Dán mã mời từ quản lý"
                />
              </label>
              <button type="submit" className="btn btn-outline" disabled={busy}>
                Gửi yêu cầu tham gia
              </button>
            </form>
          </aside>

          <div className="main-pane">
            {!selectedSummary ? (
              <div className="panel">
                <p>Hãy tạo một tòa mới hoặc nhập mã mời để bắt đầu.</p>
              </div>
            ) : selectedSummary.status === 'PENDING' ? (
              <div className="panel">
                <h2>{selectedSummary.name}</h2>
                <p>Yêu cầu tham gia của bạn đang chờ quản lý tòa duyệt.</p>
              </div>
            ) : detailError ? (
              <div className="panel" role="alert">
                <p>{detailError}</p>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => void loadBuildingDetail(selectedSummary).catch(() => {})}
                  disabled={busy}
                >
                  Thử tải lại
                </button>
              </div>
            ) : !buildingDetail || buildingDetail.id !== selectedSummary.id ? (
              <div className="panel" role="status">
                <p>Đang tải dữ liệu tòa...</p>
              </div>
            ) : (
              <>
                <div className="panel">
                  <div className="panel-head">
                    <h2>{buildingDetail.name}</h2>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => void loadBuildingDetail(selectedSummary).catch(() => {})}
                      disabled={busy}
                    >
                      Làm mới
                    </button>
                  </div>
                  <p className="muted-note">
                    Thời gian dự kiến chỉ mang tính tham khảo, không chứng minh máy đã dừng. Luôn kiểm tra thực tế tại máy trước khi sử dụng.
                  </p>
                  {syncError && (
                    <div className="alert alert-error" role="alert">
                      {syncError}
                    </div>
                  )}
                </div>

                <nav aria-label="Mục tòa nhà">
                  <button type="button" className="btn btn-outline" aria-pressed={section === 'laundry'} onClick={() => setSection('laundry')}>Giặt và hàng đợi</button>{' '}
                  <button type="button" className="btn btn-outline" aria-pressed={section === 'chat'} onClick={() => setSection('chat')}>Trò chuyện</button>
                </nav>
                {section === 'chat' && <ChatPanel buildingId={selectedSummary.id} accountId={account.id}
                  isManager={selectedSummary.role === 'MANAGER'} onSessionExpired={handleSessionExpired} />}
                {section === 'laundry' && <>
                <MachineHoldCard
                  buildingId={selectedSummary.id}
                  accountId={account.id}
                  hold={myHold}
                  machineLabel={buildingDetail.machines.find((machine) => machine.id === myHold?.machineId)?.label}
                  serverNow={serverNow}
                  onRefresh={refreshSelectedBuilding}
                  onSessionExpired={handleSessionExpired}
                />

                {myHold && <WashHoldActions
                  key={`${selectedSummary.id}:${account.id}:${myHold.id}`}
                  buildingId={selectedSummary.id}
                  hold={myHold}
                  handover={holdHandover}
                  serverNow={serverNow}
                  onRefresh={refreshSelectedBuilding}
                  onSessionExpired={handleSessionExpired}
                />}

                <WashCycleCard
                  key={`${selectedSummary.id}:${account.id}:${isSyncStale}`}
                  buildingId={selectedSummary.id}
                  cycles={isSyncStale ? null : myCycles}
                  machineLabels={machineLabels}
                  onRefresh={refreshSelectedBuilding}
                  onSessionExpired={handleSessionExpired}
                />

                <QueuePanel
                  buildingId={selectedSummary.id}
                  accountId={account.id}
                  entries={buildingDetail.queue}
                  participation={isSyncStale ? 'UNKNOWN' : participation}
                  onRefresh={refreshSelectedBuilding}
                  onSessionExpired={handleSessionExpired}
                />

                {!isSyncStale && <>
                  <QueueEstimate buildingId={selectedSummary.id} accountId={account.id} refreshKey={refreshKey} onSessionExpired={handleSessionExpired} />
                  <QueueSwapPanel buildingId={selectedSummary.id} accountId={account.id} entries={buildingDetail.queue}
                    refreshKey={refreshKey} onRefresh={refreshSelectedBuilding} onSessionExpired={handleSessionExpired} />
                </>}

                <div className="panel">
                  <h3>Danh sách máy ({buildingDetail.machines.length}/30)</h3>
                  <p className="muted-note">
                    Trạng thái &quot;Đang mở&quot; cho biết máy không bảo trì; quản lý xác nhận lồng giặt trống nếu máy bị kẹt sau bàn giao.
                  </p>
                  <div className="machine-grid">
                    {buildingDetail.machines.map((m) => (
                      <div key={m.id} className="machine-card">
                        <strong><Link href={`/buildings/${selectedSummary.id}/machines/${m.id}`}>{m.label} · Chi tiết/QR</Link></strong>
                        <span className={m.status === 'AVAILABLE' ? 'pill pill-ready' : 'pill pill-maint'}>
                          {m.status === 'AVAILABLE'
                            ? 'Đang mở'
                            : m.status === 'RUNNING'
                              ? 'Đang giặt'
                              : m.status === 'NEEDS_CHECK'
                                ? 'Cần kiểm tra'
                                : 'Bảo trì'}
                        </span>
                        {selectedSummary.role === 'MANAGER' && (
                          <div className="queue-actions">
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => void handleToggleMaintenance(m)}
                              disabled={actionsDisabled}
                            >
                              {m.status === 'MAINTENANCE' ? 'Mở lại máy' : 'Đánh dấu bảo trì'}
                            </button>
                            <ConfirmMachineFreeButton
                              buildingId={selectedSummary.id}
                              accountId={account.id}
                              isManager={selectedSummary.role === 'MANAGER' && !isSyncStale}
                              machine={m}
                              hasActiveHold={!isSyncStale && holdsVerified ? holds.some((h) => h.machineId === m.id) : null}
                              onRefresh={refreshSelectedBuilding}
                              onSessionExpired={handleSessionExpired}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {selectedSummary.role === 'MANAGER' && buildingDetail.machines.length < 30 && (
                    <form className="inline-form" onSubmit={handleAddMachine}>
                      <input
                        type="text"
                        required
                        maxLength={60}
                        value={newMachineLabel}
                        onChange={(e) => setNewMachineLabel(e.target.value)}
                        placeholder="Tên máy mới (vd: Máy tầng 2)"
                        disabled={actionsDisabled}
                      />
                      <button type="submit" className="btn btn-outline" disabled={actionsDisabled}>
                        Thêm máy
                      </button>
                    </form>
                  )}
                </div>

                {selectedSummary.role === 'MANAGER' && !isSyncStale && <WashManagerPanel
                  key={`manager:${selectedSummary.id}:${account.id}`}
                  buildingId={selectedSummary.id}
                  issues={issues}
                  machineLabels={machineLabels}
                  onRefresh={refreshSelectedBuilding}
                  onSessionExpired={handleSessionExpired}
                />}

                <BuildingAdminPanel
                  buildingId={selectedSummary.id}
                  accountId={account.id}
                  isManager={selectedSummary.role === 'MANAGER' && !isSyncStale}
                  onRefresh={refreshSelectedBuilding}
                  onSessionExpired={handleSessionExpired}
                />

                {selectedSummary.role === 'MANAGER' && (
                  <MemberManagementPanel
                    currentAccountId={account.id}
                    busy={actionsDisabled}
                    inviteToken={inviteToken}
                    pendingMembers={pendingMembers}
                    approvedMembers={approvedMembers}
                    onCreateInvite={handleCreateInvite}
                    onApproveMember={handleApproveMember}
                    onChangeRole={handleChangeMemberRole}
                  />
                )}
                </>}
              </>
            )}
          </div>
        </section>
      )}

      <footer>
        Giao diện Next.js kết nối phiên bảo mật tới backend Spring Boot Java · Đóng trang không gia hạn giữ lượt 8 phút.
      </footer>
    </main>
  );
}