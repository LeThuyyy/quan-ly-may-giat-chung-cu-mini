'use client';

import { useState } from 'react';
import { useScopedActions } from '@/lib/use-scoped-actions';
import type { WashCycleView } from './WashCycleCard';

export default function WashManagerPanel({ buildingId, issues, machineLabels, onRefresh, onSessionExpired }: {
  buildingId: string;
  issues: WashCycleView[] | null;
  machineLabels: Record<string, string>;
  onRefresh: () => Promise<void>;
  onSessionExpired: () => void;
}) {
  const { scopedFetch, refresh, sessionExpired } = useScopedActions(onRefresh, onSessionExpired);
  const [minutes, setMinutes] = useState(10);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  async function resolve(cycleId: string, action: 'CLEARED' | 'DEFER' | 'MAINTENANCE') {
    if (busy || uncertain || (action === 'CLEARED' && confirmedId !== cycleId)) return;
    setBusy(true); setError(null);
    try {
      const res = await scopedFetch(`/api/buildings/${buildingId}/wash-cycles/${cycleId}/resolve`, {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, remainingMinutes: action === 'DEFER' ? minutes : null, physicallyConfirmed: confirmedId === cycleId }),
      });
      if (res.status === 401) { sessionExpired(); return; }
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        setError(body?.error ?? 'Không xử lý được sự cố.'); setUncertain(true); return;
      }
      setConfirmedId(null);
      try { await refresh(); } catch { setUncertain(true); setError('Đã xử lý nhưng chưa thể tải lại dữ liệu.'); }
    } catch { setUncertain(true); setError('Mất kết nối. Không gửi lặp, hãy tải lại.'); }
    finally { setBusy(false); }
  }
  if (issues === null) return <section className="panel" role="status">Không tải được danh sách sự cố, hãy làm mới trang.</section>;
  if (issues.length === 0) return null;
  return <section className="panel" aria-label="Quản lý xử lý mẻ có sự cố">
    <h3>Quản lý · mẻ cần kiểm tra ({issues.length})</h3>
    {issues.map(c => <div key={c.id} className="wash-cycle-entry">
      <strong>{machineLabels[c.machineId] ?? 'Máy'} · {c.ownerName}</strong>
      <p>Đã báo còn chạy {c.overrunReports} lần. Máy không tự mở lại khi đồng hồ hết.</p>
      <label><input type="checkbox" checked={confirmedId === c.id} disabled={busy || uncertain} onChange={e => setConfirmedId(e.target.checked ? c.id : null)} />{' '}
        Tôi đã kiểm tra tại máy: máy đã dừng, đồ cũ đã được lấy/chuyển và lồng giặt trống
      </label>
      <button type="button" className="btn btn-primary" disabled={confirmedId !== c.id || busy || uncertain}
        onClick={() => void resolve(c.id, 'CLEARED')}>Xác nhận xử lý xong &amp; giải phóng máy</button>
      <label className="field"><span>Nếu máy còn chạy, quản lý nhập phút thực tế</span>
        <input type="number" min={1} max={360} value={minutes} disabled={busy || uncertain} onChange={e => setMinutes(Number(e.target.value))} />
      </label>
      <button type="button" className="btn btn-outline" disabled={busy || uncertain || !Number.isInteger(minutes) || minutes < 1 || minutes > 360}
        onClick={() => void resolve(c.id, 'DEFER')}>Quản lý xác nhận còn chạy, dời giờ</button>{' '}
      <button type="button" className="btn btn-danger" disabled={busy || uncertain}
        onClick={() => void resolve(c.id, 'MAINTENANCE')}>Đánh dấu bảo trì</button>
    </div>)}
    {error && <p role="alert" className="alert alert-error">{error}</p>}
    {uncertain && <button type="button" className="btn btn-outline" onClick={() => void refresh().then(() => { setUncertain(false); setError(null); })}>Tải lại trước khi tiếp tục</button>}
  </section>;
}
