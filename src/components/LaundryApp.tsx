'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

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
  status: 'AVAILABLE' | 'MAINTENANCE';
}

interface QueueView {
  id: string;
  accountId: string;
  displayName: string;
  position: number;
  ready: boolean;
}

interface BuildingView {
  id: string;
  name: string;
  machines: MachineView[];
  queue: QueueView[];
}

interface PendingMember {
  id: string;
  displayName: string;
}

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
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');

  const [buildings, setBuildings] = useState<BuildingSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [buildingDetail, setBuildingDetail] = useState<BuildingView | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
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
      setAccount(null);
      setBuildings([]);
      setSelectedId(null);
      setBuildingDetail(null);
      setDetailError(null);
    } else {
      setError(res.error ?? 'Không tải được danh sách tòa. Hãy thử lại.');
    }
  }, []);

  const loadBuildingDetail = useCallback(async (summary: BuildingSummary | null) => {
    const requestId = ++detailRequestId.current;
    if (!summary || summary.status !== 'APPROVED') {
      buildingDetailFor.current = null;
      setBuildingDetail(null);
      setDetailError(null);
      setPendingMembers([]);
      return;
    }
    setDetailError(null);
    if (buildingDetailFor.current !== summary.id) {
      buildingDetailFor.current = null;
      setBuildingDetail(null);
      setPendingMembers([]);
    }

    try {
      const detailRes = await apiJson<BuildingView>(`/api/buildings/${summary.id}`);
      if (requestId !== detailRequestId.current) return;
      if (detailRes.status === 401) {
        buildingDetailFor.current = null;
        setBuildingDetail(null);
        setAccount(null);
        setDetailError(null);
        return;
      }
      if (!detailRes.ok || !detailRes.data) {
        buildingDetailFor.current = null;
        setBuildingDetail(null);
        setDetailError(detailRes.error ?? 'Không tải được chi tiết tòa.');
        return;
      }
      buildingDetailFor.current = summary.id;
      setBuildingDetail(detailRes.data);

      if (summary.role === 'MANAGER') {
        const pendingRes = await apiJson<PendingMember[]>(`/api/buildings/${summary.id}/members/pending`);
        if (requestId !== detailRequestId.current) return;
        if (pendingRes.ok && pendingRes.data) {
          setPendingMembers(pendingRes.data);
        } else {
          setError(pendingRes.error ?? 'Không tải được danh sách chờ duyệt.');
        }
      }
    } catch {
      if (requestId === detailRequestId.current) {
        buildingDetailFor.current = null;
        setBuildingDetail(null);
        setDetailError('Kết nối bị gián đoạn. Hãy thử tải lại dữ liệu tòa.');
      }
    }
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
    const summary: BuildingSummary | null = selectedId && selectedRole && selectedStatus
      ? { id: selectedId, name: '', role: selectedRole, status: selectedStatus }
      : null;
    // Defer the state update to the asynchronous load; do not set state during effect setup.
    void Promise.resolve().then(() => loadBuildingDetail(summary));
    return () => { detailRequestId.current += 1; };
  }, [selectedId, selectedRole, selectedStatus, loadBuildingDetail]);

  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (authMode === 'register') {
        const res = await apiJson<AccountView>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ username, displayName, password }),
        });
        if (!res.ok) {
          setError(res.error ?? 'Đăng ký thất bại.');
          return;
        }
        setNotice('Đăng ký thành công. Vui lòng đăng nhập để tiếp tục.');
        setAuthMode('login');
        setPassword('');
        return;
      }

      const res = await apiJson<AccountView>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok || !res.data) {
        setError(res.error ?? 'Đăng nhập thất bại.');
        return;
      }
      setAccount(res.data);
      setPassword('');
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
      buildingDetailFor.current = null;
      setAccount(null);
      setBuildings([]);
      setSelectedId(null);
      setBuildingDetail(null);
      setDetailError(null);
      setPendingMembers([]);
      setInviteToken(null);
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
    if (!selectedSummary) return;
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
      await loadBuildingDetail(selectedSummary);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleMaintenance = async (machine: MachineView) => {
    if (!selectedSummary) return;
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
      await loadBuildingDetail(selectedSummary);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateInvite = async () => {
    if (!selectedSummary) return;
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
    if (!selectedSummary) return;
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
      await loadBuildingDetail(selectedSummary);
    } finally {
      setBusy(false);
    }
  };

  const handleJoinQueue = async (ready: boolean) => {
    if (!selectedSummary) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiJson(`/api/buildings/${selectedSummary.id}/queue`, {
        method: 'POST',
        body: JSON.stringify({ ready }),
      });
      if (!res.ok) {
        setError(res.error ?? 'Không vào được hàng đợi.');
        return;
      }
      await loadBuildingDetail(selectedSummary);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleReady = async (ready: boolean) => {
    if (!selectedSummary) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiJson(`/api/buildings/${selectedSummary.id}/queue/me`, {
        method: 'PATCH',
        body: JSON.stringify({ ready }),
      });
      if (!res.ok) {
        setError(res.error ?? 'Không đổi được trạng thái sẵn sàng.');
        return;
      }
      await loadBuildingDetail(selectedSummary);
    } finally {
      setBusy(false);
    }
  };

  const handleLeaveQueue = async () => {
    if (!selectedSummary) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiJson(`/api/buildings/${selectedSummary.id}/queue/me`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        setError(res.error ?? 'Không rời được hàng đợi.');
        return;
      }
      await loadBuildingDetail(selectedSummary);
    } finally {
      setBusy(false);
    }
  };

  const myQueueEntry = buildingDetail?.queue.find((q) => q.accountId === account?.id) ?? null;

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
        <section className="auth-grid">
          <div className="hero-compact">
            <p className="eyebrow">CHUNG MÁY · KHÔNG CHUNG NỖI LO</p>
            <h1>Hàng đợi giặt chung cho tòa nhà.</h1>
            <p className="lead">
              Đăng nhập bằng phiên bảo mật qua máy chủ Java. Tạo tòa (1–30 máy), mời cư dân và xếp hàng minh bạch.
            </p>
            <p className="muted-note">
              Phạm vi hiện tại: chưa có giao máy tự động, đồng hồ 8 phút, ETA, đổi lượt hoặc chat.
            </p>
          </div>

          <form className="panel" onSubmit={handleAuthSubmit}>
            <div className="tabs">
              <button
                type="button"
                className={authMode === 'login' ? 'tab active' : 'tab'}
                onClick={() => { setAuthMode('login'); setError(null); }}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                className={authMode === 'register' ? 'tab active' : 'tab'}
                onClick={() => { setAuthMode('register'); setError(null); }}
              >
                Đăng ký
              </button>
            </div>

            <label className="field">
              <span>Tên đăng nhập</span>
              <input
                type="text"
                required
                maxLength={80}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="vd: phong302"
                autoComplete="username"
              />
            </label>

            {authMode === 'register' && (
              <label className="field">
                <span>Tên hiển thị</span>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="vd: Phòng 302 - An"
                />
              </label>
            )}

            <label className="field">
              <span>Mật khẩu {authMode === 'register' ? '(tối thiểu 12 ký tự)' : ''}</span>
              <input
                type="password"
                required
                minLength={authMode === 'register' ? 12 : 1}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>

            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Đang xử lý...' : authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
            </button>
          </form>
        </section>
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
                        onClick={() => { setSelectedId(b.id); setInviteToken(null); }}
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
                <button type="button" className="btn btn-outline" onClick={() => void loadBuildingDetail(selectedSummary)} disabled={busy}>
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
                      onClick={() => void loadBuildingDetail(selectedSummary)}
                      disabled={busy}
                    >
                      Làm mới
                    </button>
                  </div>

                  <div className="queue-actions">
                    {!myQueueEntry ? (
                      <>
                        <button type="button" className="btn btn-primary" onClick={() => void handleJoinQueue(true)} disabled={busy}>
                          Vào hàng (Sẵn sàng)
                        </button>
                        <button type="button" className="btn btn-outline" onClick={() => void handleJoinQueue(false)} disabled={busy}>
                          Vào hàng (Chưa sẵn sàng)
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => void handleToggleReady(!myQueueEntry.ready)}
                          disabled={busy}
                        >
                          {myQueueEntry.ready ? 'Chuyển sang Chưa sẵn sàng' : 'Bật Sẵn sàng'}
                        </button>
                        <button type="button" className="btn btn-danger" onClick={() => void handleLeaveQueue()} disabled={busy}>
                          Rời hàng
                        </button>
                      </>
                    )}
                  </div>

                  <h3>Hàng đợi hiện tại ({buildingDetail.queue.length})</h3>
                  {buildingDetail.queue.length === 0 ? (
                    <p className="muted-note">Chưa có ai trong hàng đợi.</p>
                  ) : (
                    <ul className="queue-list">
                      {buildingDetail.queue.map((entry, idx) => (
                        <li key={entry.id} className={entry.accountId === account.id ? 'queue-row me' : 'queue-row'}>
                          <span>
                            <strong>#{idx + 1}</strong> {entry.displayName} (mốc {entry.position})
                          </span>
                          <span className={entry.ready ? 'pill pill-ready' : 'pill pill-wait'}>
                            {entry.ready ? 'Sẵn sàng' : 'Chưa sẵn sàng'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="panel">
                  <h3>Danh sách máy ({buildingDetail.machines.length}/30)</h3>
                  <p className="muted-note">
                    Trạng thái &quot;Đang mở&quot; chỉ có nghĩa quản lý chưa đánh dấu bảo trì; chưa theo dõi lồng giặt thực tế.
                  </p>
                  <div className="machine-grid">
                    {buildingDetail.machines.map((m) => (
                      <div key={m.id} className="machine-card">
                        <strong>{m.label}</strong>
                        <span className={m.status === 'AVAILABLE' ? 'pill pill-ready' : 'pill pill-maint'}>
                          {m.status === 'AVAILABLE' ? 'Đang mở' : 'Bảo trì'}
                        </span>
                        {selectedSummary.role === 'MANAGER' && (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => void handleToggleMaintenance(m)}
                            disabled={busy}
                          >
                            {m.status === 'MAINTENANCE' ? 'Mở lại máy' : 'Đánh dấu bảo trì'}
                          </button>
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
                      />
                      <button type="submit" className="btn btn-outline" disabled={busy}>
                        Thêm máy
                      </button>
                    </form>
                  )}
                </div>

                {selectedSummary.role === 'MANAGER' && (
                  <div className="panel">
                    <h3>Quản lý cư dân</h3>
                    <div className="invite-box">
                      <button type="button" className="btn btn-outline" onClick={() => void handleCreateInvite()} disabled={busy}>
                        Tạo mã mời 7 ngày
                      </button>
                      {inviteToken && (
                        <div className="token-box">
                          <code>{inviteToken}</code>
                        </div>
                      )}
                    </div>

                    <h4>Yêu cầu chờ duyệt ({pendingMembers.length})</h4>
                    {pendingMembers.length === 0 ? (
                      <p className="muted-note">Không có yêu cầu nào đang chờ duyệt.</p>
                    ) : (
                      <ul className="queue-list">
                        {pendingMembers.map((m) => (
                          <li key={m.id} className="queue-row">
                            <span>{m.displayName}</span>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => void handleApproveMember(m.id)}
                              disabled={busy}
                            >
                              Duyệt
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      <footer>
        Giao diện Next.js kết nối phiên bảo mật tới backend Spring Boot Java · Chưa có giao máy tự động, đồng hồ 8 phút, ETA, đổi lượt hoặc chat.
      </footer>
    </main>
  );
}
