'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AuthSection from './AuthSection';
import MachineHoldCard, { type MachineHoldView } from './MachineHoldCard';
import WashHoldActions from './WashHoldActions';
import WashCycleCard, { type WashCycleView } from './WashCycleCard';
import MachineQrButton from './MachineQrButton';

interface Detail { id: string; label: string; status: string; ownHold: MachineHoldView | null; ownCycles: WashCycleView[]; previousCycle: WashCycleView | null; serverNow?: string }
interface Membership { id: string; role: string; status: string }
const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Đang mở',
  RUNNING: 'Đang giặt',
  NEEDS_CHECK: 'Cần kiểm tra',
  MAINTENANCE: 'Bảo trì',
};
export default function MachineDetailPage(props: { buildingId: string; machineId: string }) {
  return <MachinePage key={`${props.buildingId}:${props.machineId}`} {...props} />;
}
function MachinePage({ buildingId, machineId }: { buildingId: string; machineId: string }) {
  const [account, setAccount] = useState<{ id: string } | null>(null);
  const [checked, setChecked] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const authBusy = useRef(false);
  const expired = useCallback(() => { sequence.current++; setAccount(null); setDetail(null); setMembership(null); setChecked(true); }, []);
  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    const request = ++sequence.current;
    if (!options?.silent) {
      setDetail(null); setMembership(null); setError('');
    }
    try {
      const [me, buildings, machine] = await Promise.all([
        fetch('/api/me', { cache: 'no-store' }), fetch('/api/buildings', { cache: 'no-store' }),
        fetch(`/api/buildings/${buildingId}/machines/${machineId}`, { cache: 'no-store' }),
      ]);
      if (request !== sequence.current) return;
      if ([me, buildings, machine].some(r => r.status === 401)) { expired(); return; }
      if (!me.ok || !buildings.ok || !machine.ok) throw new Error('Không thể mở máy. Cần là thành viên đã duyệt của đúng tòa; hãy tải lại khi quyền thay đổi.');
      const [a, list, d] = await Promise.all([me.json(), buildings.json(), machine.json()]) as [{ id: string }, Membership[], Detail];
      if (request !== sequence.current) return;
      const member = list.find(b => b.id === buildingId && b.status === 'APPROVED');
      if (!member) throw new Error('Bạn chưa được duyệt trong tòa này.');
      setAccount(a); setMembership(member); setDetail(d); setError('');
    } catch (e) {
      if (request === sequence.current) {
        setDetail(null); setMembership(null);
        setError(e instanceof Error ? e.message : 'Không tải được máy.');
      }
    }
    finally { if (request === sequence.current) setChecked(true); }
  }, [buildingId, machineId, expired]);
  useEffect(() => {
    let active = true;
    const invalidate = () => { sequence.current++; };
    void Promise.resolve().then(() => { if (active) return refresh(); });
    return () => { active = false; invalidate(); };
  }, [refresh]);
  useEffect(() => {
    if (!account || !membership || membership.status !== 'APPROVED') return;
    let active = true;
    let running = false;
    let timer: number;
    const tick = async () => {
      if (!active || running) return;
      window.clearTimeout(timer);
      running = true;
      try {
        if (document.visibilityState === 'visible') await refresh({ silent: true });
      } finally {
        running = false;
        if (active) timer = window.setTimeout(() => void tick(), 5000);
      }
    };
    timer = window.setTimeout(() => void tick(), 5000);
    const onVisibility = () => { if (document.visibilityState === 'visible') void tick(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [account, membership, refresh]);
  async function auth(path: 'login' | 'register', payload: object) {
    if (authBusy.current) return false;
    authBusy.current = true; setBusy(true); setError('');
    try {
      const response = await fetch(`/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store' });
      if (!response.ok) { setError('Không thể đăng nhập/đăng ký. Kiểm tra thông tin và thử lại.'); return false; }
      if (path === 'login') await refresh();
      return true;
    } catch { setError('Không kết nối được máy chủ.'); return false; }
    finally { authBusy.current = false; setBusy(false); }
  }
  return <main className="shell">
    <Link href="/">Về danh sách tòa</Link>
    <h1>Chi tiết máy giặt</h1>
    <p>Trang máy không xác nhận máy đã dừng hay trống đồ. Luôn kiểm tra tại chỗ trước thao tác.</p>
    {error && <p role="alert">{error}</p>}
    {!checked ? <p role="status">Đang kiểm tra phiên…</p> : !account ? <AuthSection busy={busy}
      onLogin={async (username, password) => { await auth('login', { username, password }); }}
      onRegister={(username, displayName, password) => auth('register', { username, displayName, password })}
      onClearMessages={() => setError('')} /> : null}
    <button type="button" onClick={() => void refresh()}>Tải lại trạng thái máy</button>
    {account && detail && membership && <section className="panel">
      <h2>{detail.label}</h2><p>Trạng thái hệ thống: {STATUS_LABELS[detail.status] ?? detail.status} ({detail.status} · không phải xác minh vật lý).</p>
      <MachineQrButton buildingId={buildingId} machineId={machineId} onSessionExpired={expired} />
      <MachineHoldCard buildingId={buildingId} accountId={account.id} hold={detail.ownHold} machineLabel={detail.label} serverNow={detail.serverNow} onRefresh={() => refresh()} onSessionExpired={expired} />
      {detail.ownHold && <WashHoldActions key={detail.ownHold.id} buildingId={buildingId} hold={detail.ownHold} handover={detail.previousCycle} serverNow={detail.serverNow} onRefresh={() => refresh()} onSessionExpired={expired} />}
      <WashCycleCard buildingId={buildingId} cycles={detail.ownCycles} machineLabels={{ [machineId]: detail.label }} onRefresh={() => refresh()} onSessionExpired={expired} />
    </section>}
  </main>;
}
