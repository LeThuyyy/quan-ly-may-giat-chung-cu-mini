'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface BuildingAdminPanelProps {
  buildingId: string;
  accountId: string;
  isManager: boolean;
  onRefresh: () => Promise<void>;
  onSessionExpired: () => void;
}
type Tab = 'invitations' | 'removed' | 'residents' | 'activity';
interface Invitation { id: string; createdAt: string; expiresAt: string; revokedAt: string | null; status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' }
interface Member { id: string; username: string; displayName: string; role: string; status: string }
interface Activity { id: string; actorId: string | null; action: string; targetId: string | null; machineId: string | null; beforeState: string | null; afterState: string | null; occurredAt: string }
interface Page<T> { items: T[]; page: number; size: number; hasNext: boolean }
interface Snapshot { invitations: Invitation[]; members: Member[]; activity: Activity[]; hasNext: boolean }
const empty: Snapshot = { invitations: [], members: [], activity: [], hasNext: false };

export default function BuildingAdminPanel(props: BuildingAdminPanelProps) {
  return props.isManager ? <ScopedAdminPanel key={`${props.buildingId}:${props.accountId}`} {...props} /> : null;
}

function ScopedAdminPanel({ buildingId, accountId, onRefresh, onSessionExpired }: BuildingAdminPanelProps) {
  const [tab, setTab] = useState<Tab>('invitations');
  const [page, setPage] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const [busy, setBusy] = useState(true);
  const [blocked, setBlocked] = useState(true);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState('');
  const [confirming, setConfirming] = useState(false);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const callbacks = useRef({ onRefresh, onSessionExpired });
  useEffect(() => { callbacks.current = { onRefresh, onSessionExpired }; }, [onRefresh, onSessionExpired]);

  const read = useCallback(async (nextTab: Tab, nextPage: number, controller: AbortController) => {
    const suffix = nextTab === 'residents' ? 'members' : nextTab === 'removed' ? 'members/removed' : nextTab;
    const response = await fetch(`/api/buildings/${buildingId}/${suffix}${nextTab === 'residents' ? '' : `?page=${nextPage}&size=20`}`, { cache: 'no-store', signal: controller.signal });
    if (!mounted.current || controller.signal.aborted) return;
    if (response.status === 401) {
      setExpired(true);
      callbacks.current.onSessionExpired();
      throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }
    if (!response.ok) throw new Error('Không tải được dữ liệu quản trị. Hãy tải lại trước khi thao tác.');
    const data = await response.json();
    if (!mounted.current || controller.signal.aborted) return;
    if (nextTab === 'residents') {
      if (!Array.isArray(data)) throw new Error('Dữ liệu thành viên không hợp lệ.');
      setSnapshot({ ...empty, members: (data as Member[]).filter((member) => member.status === 'APPROVED' && member.role === 'RESIDENT' && member.id !== accountId) });
    } else {
      const result = data as Page<Invitation | Member | Activity>;
      if (!Array.isArray(result.items) || result.page !== nextPage || result.size !== 20 || typeof result.hasNext !== 'boolean') throw new Error('Dữ liệu phân trang không hợp lệ.');
      setSnapshot({ ...empty, hasNext: result.hasNext,
        ...(nextTab === 'invitations' ? { invitations: result.items as Invitation[] } : nextTab === 'removed' ? { members: result.items as Member[] } : { activity: result.items as Activity[] }),
      });
    }
    setBlocked(false);
  }, [buildingId, accountId]);

  const load = useCallback(async (nextTab: Tab, nextPage: number, refreshParent = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setBlocked(true); setError(''); setSelected(''); setConfirming(false); setSnapshot(empty);
    try {
      if (refreshParent) await callbacks.current.onRefresh();
      if (!mounted.current || controller.signal.aborted) return;
      await read(nextTab, nextPage, controller);
    } catch (failure) {
      if (mounted.current && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Không tải lại được trạng thái.');
    } finally {
      if (pending.current === controller) {
        inFlight.current = false;
        if (mounted.current) setBusy(false);
      }
    }
  }, [read]);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    pending.current = controller;
    inFlight.current = true;
    // read updates state only after awaiting fetch; this effect starts the scoped subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void read('invitations', 0, controller).catch((failure: unknown) => {
      if (mounted.current && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Không tải được dữ liệu quản trị.');
    }).finally(() => {
      if (pending.current === controller && !controller.signal.aborted) {
        inFlight.current = false;
        if (mounted.current) setBusy(false);
      }
    });
    return () => { mounted.current = false; controller.abort(); pending.current?.abort(); inFlight.current = false; };
  }, [read]);

  async function mutate(path: string, method: 'POST' | 'DELETE', message: string) {
    if (inFlight.current || blocked || expired) return;
    inFlight.current = true;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setBlocked(true); setError(''); setNotice(''); setConfirming(false);
    try {
      const response = await fetch(`/api/buildings/${buildingId}/${path}`, { method, cache: 'no-store', signal: controller.signal });
      if (!mounted.current || controller.signal.aborted) return;
      if (response.status === 401) {
        setExpired(true); callbacks.current.onSessionExpired();
        throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        if (!mounted.current || controller.signal.aborted) return;
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Thao tác bị từ chối. Hãy tải lại trạng thái.');
      }
      setNotice(message);
      await callbacks.current.onRefresh();
      if (!mounted.current || controller.signal.aborted) return;
      setSelected('');
      await read(tab, page, controller);
    } catch (failure) {
      if (mounted.current && !controller.signal.aborted) setError(`${failure instanceof Error ? failure.message : 'Mất kết nối.'} Chưa xác minh được trạng thái mới; hãy tải lại, không gửi lặp.`);
    } finally {
      if (pending.current === controller) {
        inFlight.current = false;
        if (mounted.current) setBusy(false);
      }
    }
  }

  const disabled = busy || blocked || expired;
  const resident = snapshot.members.find((member) => member.id === selected && member.role === 'RESIDENT' && member.status === 'APPROVED' && member.id !== accountId);
  function navigate(nextTab: Tab, nextPage: number) {
    if (busy || blocked || expired) return;
    setTab(nextTab); setPage(nextPage); setNotice('');
    void load(nextTab, nextPage);
  }
  return <section className="panel" aria-label="Quản trị tòa nhà" aria-busy={busy}>
    <h3>Quản trị tòa nhà</h3>
    <div className="action-row" aria-label="Mục quản trị">
      {([['invitations', 'Lời mời'], ['removed', 'Thành viên đã gỡ'], ['residents', 'Gỡ cư dân'], ['activity', 'Nhật ký hoạt động']] as const).map(([value, label]) =>
        <button className="btn btn-outline btn-sm" type="button" key={value} disabled={busy || blocked || expired} aria-pressed={tab === value} onClick={() => navigate(value, 0)}>{label}</button>)}
    </div>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <button className="btn btn-outline btn-sm" type="button" disabled={busy || expired} onClick={() => void load(tab, page, true)}>Tải lại quản trị</button>
    {busy && <p role="status">Đang tải…</p>}
    {!busy && !blocked && tab === 'invitations' && <ul className="queue-list">
      {snapshot.invitations.length === 0 && <li>Chưa có lời mời.</li>}
      {snapshot.invitations.map((invite) => <li className="queue-row" key={invite.id}>
        <span>{invite.id} — {({ ACTIVE: 'Còn hiệu lực', EXPIRED: 'Hết hạn', REVOKED: 'Đã thu hồi' })[invite.status] ?? invite.status}<br />Tạo: {invite.createdAt} · Hết hạn: {invite.expiresAt}{invite.revokedAt && <> · Thu hồi: {invite.revokedAt}</>}</span>
        <button className="btn btn-outline btn-sm" type="button" disabled={disabled || invite.status !== 'ACTIVE'} onClick={() => void mutate(`invitations/${encodeURIComponent(invite.id)}/revoke`, 'POST', 'Đã thu hồi lời mời.')}>Thu hồi</button>
      </li>)}
    </ul>}
    {!busy && !blocked && tab === 'removed' && <>
      <p className="muted-note">Khôi phục chỉ chuyển về Chờ duyệt. Hãy duyệt riêng tại mục quản lý thành viên.</p>
      <ul className="queue-list">{snapshot.members.length === 0 && <li>Không có thành viên đã gỡ.</li>}{snapshot.members.map((member) => <li className="queue-row" key={member.id}>
        <span>{member.displayName} ({member.username})</span>
        <button className="btn btn-outline btn-sm" type="button" disabled={disabled || member.status !== 'REMOVED'} onClick={() => void mutate(`members/${encodeURIComponent(member.id)}/restore`, 'POST', 'Đã khôi phục về Chờ duyệt; cần duyệt riêng.')}>Khôi phục</button>
      </li>)}</ul>
    </>}
    {!busy && !blocked && tab === 'residents' && <>
      <label>Cư dân cần gỡ<select aria-label="Cư dân cần gỡ" value={selected} disabled={disabled} onChange={(event) => { setSelected(event.target.value); setConfirming(false); }}>
        <option value="">Chọn cư dân</option>{snapshot.members.map((member) => <option key={member.id} value={member.id}>{member.displayName} ({member.username})</option>)}
      </select></label>
      <button className="btn btn-outline" type="button" disabled={disabled || !resident} onClick={() => setConfirming(true)}>Gỡ khỏi tòa</button>
      {confirming && resident && <div role="group" aria-label="Xác nhận gỡ cư dân">
        <p>Gỡ {resident.displayName} khỏi tòa? Lượt chờ (WAITING) sẽ kết thúc; lượt giữ (HELD) sẽ bị hủy và máy được xét cấp lại. Không thể gỡ khi đang giặt (WASHING) hoặc còn mẻ chưa hoàn tất; máy chủ sẽ kiểm tra.</p>
        <button className="btn btn-primary" type="button" disabled={disabled} onClick={() => void mutate(`members/${encodeURIComponent(resident.id)}`, 'DELETE', 'Đã gỡ cư dân khỏi tòa.')}>Xác nhận gỡ</button>{' '}
        <button className="btn btn-outline" type="button" disabled={disabled} onClick={() => setConfirming(false)}>Hủy</button>
      </div>}
    </>}
    {!busy && !blocked && tab === 'activity' && <ul className="queue-list">{snapshot.activity.length === 0 && <li>Chưa có hoạt động.</li>}{snapshot.activity.map((item) => <li key={item.id}>
      <strong>{item.action}</strong> — {item.occurredAt}<br />Người thực hiện: {item.actorId ?? 'Hệ thống'} · Đối tượng: {item.targetId ?? '—'} · Máy: {item.machineId ?? '—'}<br />Trước: {item.beforeState ?? '—'} · Sau: {item.afterState ?? '—'}
    </li>)}</ul>}
    {tab !== 'residents' && <div className="action-row">
      <button className="btn btn-outline btn-sm" type="button" disabled={disabled || page === 0} onClick={() => navigate(tab, page - 1)}>Trang trước</button>
      <span>Trang {page + 1}</span>
      <button className="btn btn-outline btn-sm" type="button" disabled={disabled || !snapshot.hasNext} onClick={() => navigate(tab, page + 1)}>Trang sau</button>
    </div>}
  </section>;
}
