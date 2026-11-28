'use client';

import { useEffect, useRef, useState } from 'react';
import { useScopedActions } from '@/lib/use-scoped-actions';
import { ownerAdjustmentRequest, resolveOwnerAdjustment } from '@/lib/owner-adjustment-requests';

export type HandoverMode = 'ALLOW_TRANSFER' | 'SELF_PICKUP';
export interface WashCycleView {
  id: string;
  machineId: string;
  queueEntryId: string;
  accountId: string;
  ownerName: string;
  startHoldId: string;
  startedAt: string;
  durationMinutes: number;
  estimatedEndAt: string;
  inspectionAt: string;
  serverNow: string;
  handoverMode: HandoverMode;
  state: 'ACTIVE' | 'NEEDS_MANAGER' | 'COMPLETED';
  overrunReports: number;
  completedAt: string | null;
  completion: string | null;
  phase: 'RUNNING' | 'SELF_PICKUP' | 'INSPECTION_ELIGIBLE' | 'NEEDS_MANAGER' | 'COMPLETED';
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('vi-VN') : 'Chưa xác minh';
}

export default function WashCycleCard({ buildingId, cycles, machineLabels, onRefresh, onSessionExpired }: {
  buildingId: string;
  cycles: WashCycleView[] | null;
  machineLabels: Record<string, string>;
  onRefresh: () => Promise<void>;
  onSessionExpired: () => void;
}) {
  const { scopedFetch, refresh, sessionExpired } = useScopedActions(onRefresh, onSessionExpired);
  const [now, setNow] = useState<number | null>(null);
  const [checkedId, setCheckedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ownerMinutes, setOwnerMinutes] = useState(10);
  const clockOffsetRef = useRef<number>(0);

  useEffect(() => {
    const firstServerNow = cycles?.[0]?.serverNow;
    const parsed = firstServerNow ? Date.parse(firstServerNow) : NaN;
    clockOffsetRef.current = Number.isFinite(parsed) ? parsed - Date.now() : 0;
  }, [cycles]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + clockOffsetRef.current), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!cycles) return <section className="panel" role="status">Chưa xác minh được mẻ của bạn. Hãy tải lại trạng thái.</section>;
  if (cycles.length === 0) return null;

  async function pickup(cycle: WashCycleView) {
    if (busy || uncertain || checkedId !== cycle.id) return;
    setBusy(true); setError(null);
    try {
      const res = await scopedFetch(`/api/buildings/${buildingId}/wash-cycles/${cycle.id}/pickup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ physicallyConfirmed: true }), cache: 'no-store',
      });
      if (res.status === 401) { sessionExpired(); return; }
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        setError(body?.error ?? 'Không xác nhận được lấy đồ.'); setUncertain(true); return;
      }
      setNotice('Đã hoàn tất mẻ cũ và giải phóng yêu cầu giặt.');
      setCheckedId(null);
      try { await refresh(); } catch { setUncertain(true); setError('Đã ghi nhận nhưng chưa tải được trạng thái. Không gửi lại.'); }
    } catch { setUncertain(true); setError('Mất kết nối; không rõ thao tác đã hoàn thành chưa. Hãy tải lại trước.'); }
    finally { setBusy(false); }
  }

  async function updateRemaining(cycle: WashCycleView) {
    if (busy || uncertain || !Number.isInteger(ownerMinutes) || ownerMinutes < 1 || ownerMinutes > 360) return;
    setBusy(true); setError(null);
    const requestKey = `${cycle.accountId}:${buildingId}:${cycle.id}`;
    try {
      const request = ownerAdjustmentRequest(requestKey, ownerMinutes);
      const res = await scopedFetch(`/api/buildings/${buildingId}/wash-cycles/${cycle.id}/remaining`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ remainingMinutes: ownerMinutes, clientRequestId: request.id }),
      });
      if (res.status === 401) { sessionExpired(); return; }
      if (!res.ok) {
        const responseBody = await res.json().catch(() => null) as { error?: string } | null;
        setError(responseBody?.error ?? 'Không thay đổi được giờ dự kiến.'); setUncertain(true); return;
      }
      setNotice('Đã ghi nhận thời gian còn lại. Kiểm tra mốc dự kiến mới từ máy chủ.');
      try {
        await refresh();
        resolveOwnerAdjustment(requestKey);
      } catch { setUncertain(true); setError('Đã ghi nhận nhưng chưa tải được trạng thái. Không gửi lại.'); }
    } catch { setUncertain(true); setError('Mất kết nối, chưa rõ kết quả. Hãy tải lại trước.'); }
    finally { setBusy(false); }
  }

  return <section className="panel panel-washing" aria-label="Mẻ giặt của tôi">
    <h3>Mẻ giặt của bạn</h3>
    {cycles.map(c => {
      const remaining = now === null ? null : Math.max(0, Math.ceil((Date.parse(c.estimatedEndAt) - now) / 1000));
      const label = c.phase === 'NEEDS_MANAGER' ? 'Đang chờ quản lý xử lý'
        : c.phase === 'SELF_PICKUP' ? 'Trong 10 phút ưu tiên tự lấy'
        : c.phase === 'INSPECTION_ELIGIBLE' ? 'Đã tới giờ mời người khác lên kiểm tra'
        : 'Đang đếm giờ giặt dự kiến';
      return <div key={c.id} className="wash-cycle-entry">
        <strong>{machineLabels[c.machineId] ?? 'Máy giặt'}</strong>
        <p>{label} · {c.durationMinutes} phút · {c.handoverMode === 'SELF_PICKUP' ? 'Ưu tiên tự lấy' : 'Cho phép chuyển đồ'}</p>
        <p>Giờ kết thúc dự kiến: <strong>{formatDate(c.estimatedEndAt)}</strong></p>
        <p>Được mời kiểm tra từ: {formatDate(c.inspectionAt)}</p>
        <p role="timer">Còn dự kiến: <strong>{remaining === null ? '--:--' : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}</strong></p>
        <p className="muted-note">Đồng hồ về 0 KHÔNG có nghĩa máy đã dừng. Người dùng phải kiểm tra thực tế.</p>
        {c.state === 'ACTIVE' && <>
          {(c.phase === 'RUNNING' || (c.phase === 'INSPECTION_ELIGIBLE' && c.handoverMode === 'ALLOW_TRANSFER')) && <div className="field">
            <label>Phút còn lại thực tế trên bảng máy (nếu thay đổi):
              <input type="number" value={ownerMinutes} min={1} max={360}
                onChange={e => setOwnerMinutes(Number(e.target.value))} disabled={busy || uncertain} />
            </label>
            <button type="button" className="btn btn-outline" disabled={busy || uncertain || !Number.isInteger(ownerMinutes) || ownerMinutes < 1 || ownerMinutes > 360}
              onClick={() => void updateRemaining(c)}>Báo phút còn lại (dời một lần)</button>
            <p className="muted-note">Không tự gia hạn nếu lượt kiểm tra đã giao. Báo tiếp lần thứ hai cần quản lý.</p>
          </div>}
          <label><input type="checkbox" checked={checkedId === c.id} disabled={busy || uncertain}
            onChange={e => setCheckedId(e.target.checked ? c.id : null)} />{' '}
            Tôi đã thấy máy dừng và lấy hết đồ của mình khỏi lồng giặt
          </label>
          <button className="btn btn-primary" type="button" disabled={busy || uncertain || checkedId !== c.id}
            onClick={() => void pickup(c)}>Xác nhận đã lấy đồ (kể cả lấy sớm)</button>
        </>}
      </div>;
    })}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert" className="alert alert-error">{error}</p>}
    {uncertain && <button type="button" className="btn btn-outline" onClick={() => void refresh().then(() => { setUncertain(false); setError(null); }).catch(() => setError('Tải lại thất bại.'))}>Tải lại trạng thái</button>}
  </section>;
}
