'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useScopedActions } from '@/lib/use-scoped-actions';
import type { MachineHoldView } from './MachineHoldCard';
import type { HandoverMode, WashCycleView } from './WashCycleCard';

export default function WashHoldActions({ buildingId, hold, handover, serverNow, onRefresh, onSessionExpired }: {
  buildingId: string;
  hold: MachineHoldView;
  /** undefined: load failed/unknown; null: verified no old cycle */
  handover: WashCycleView | null | undefined;
  /** Optional server timestamp from snapshot to compensate for client clock skew. */
  serverNow?: string;
  onRefresh: () => Promise<void>;
  onSessionExpired: () => void;
}) {
  const { scopedFetch, refresh, sessionExpired } = useScopedActions(onRefresh, onSessionExpired);
  const clockOffsetRef = useRef<number>(0);
  const currentServerMs = () => Date.now() + clockOffsetRef.current;
  const [minutes, setMinutes] = useState(45);
  const [mode, setMode] = useState<HandoverMode>('ALLOW_TRANSFER');
  const [remaining, setRemaining] = useState('');
  const [physical, setPhysical] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const deadline = Date.parse(hold.expiresAt);
  const expired = now === null || !Number.isFinite(deadline) || now >= deadline;

  useEffect(() => {
    const parsed = serverNow ? Date.parse(serverNow) : NaN;
    clockOffsetRef.current = Number.isFinite(parsed) ? parsed - Date.now() : 0;
  }, [serverNow]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() + clockOffsetRef.current), 250);
    return () => window.clearInterval(timer);
  }, []);

  const canStart = handover === null && hold.physicallyChecked === true && !expired && !uncertain && !busy;

  async function mutate(path: string, payload: unknown, success: string) {
    // Background tabs may throttle the timer; check the current clock again on click.
    if (busy || uncertain || expired || currentServerMs() >= deadline) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await scopedFetch(`/api/buildings/${buildingId}/${path}`, {
        method: 'POST', cache: 'no-store',
        ...(payload === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
      });
      if (response.status === 401) { sessionExpired(); return; }
      if (!response.ok) {
        const message = await response.json().catch(() => null) as { error?: string } | null;
        setError(message?.error ?? 'Máy chủ không chấp nhận thao tác.');
        setUncertain(true);
        return;
      }
      setPhysical(false); setNotice(success);
      try { await refresh(); } catch { setError('Thao tác đã được ghi nhận nhưng chưa tải lại được.'); setUncertain(true); }
    } catch { setUncertain(true); setError('Mất kết nối, chưa rõ thao tác đã ghi nhận chưa. Hãy tải lại, không gửi lặp.'); }
    finally { setBusy(false); }
  }
  function start(e: FormEvent) {
    e.preventDefault();
    if (!canStart || !Number.isInteger(minutes) || minutes < 1 || minutes > 360) return;
    void mutate(`holds/${hold.id}/start`, { durationMinutes: minutes, handoverMode: mode }, 'Đã bắt đầu mẻ giặt.');
  }

  return <section className="panel" aria-label="Bắt đầu giặt và bàn giao">
    <h3>Giặt &amp; bàn giao · lượt của bạn</h3>
    {handover === undefined && <p role="status">Chưa tải được tình trạng mẻ trước. Để an toàn chưa thể bắt đầu giặt.</p>}
    {handover && <>
      <p><strong>Đồ mẻ cũ của {handover.ownerName}</strong> vẫn cần bàn giao.</p>
      <p>Máy được mời lên <strong>kiểm tra</strong> từ {new Date(handover.inspectionAt).toLocaleString('vi-VN')}, không phải tự động dừng.</p>
      <p>Chế độ: {handover.handoverMode === 'SELF_PICKUP' ? 'Ưu tiên chủ đồ tự lấy 10 phút' : 'Có thể chuyển đồ sang chậu chủ mẻ'}.</p>
      {handover.phase === 'INSPECTION_ELIGIBLE' && <>
        <label><input type="checkbox" checked={physical} onChange={e => setPhysical(e.target.checked)} disabled={busy || uncertain} />{' '}
          Tôi đã kiểm tra máy dừng và chuyển toàn bộ đồ cũ vào chậu của chủ mẻ
        </label>
        <button type="button" className="btn btn-primary" disabled={!physical || busy || uncertain || expired}
          onClick={() => void mutate(`wash-cycles/${handover.id}/transfer`, { holdId: hold.id, physicallyConfirmed: true }, 'Đã xác nhận chuyển đồ. Hãy xác nhận kiểm tra máy rồi bắt đầu giặt.')}>Xác nhận đã chuyển đồ</button>
      </>}
      {handover.state === 'ACTIVE' && <div className="field">
        <label htmlFor="remaining-running">Máy vẫn chạy? Nhập phút còn lại trên bảng (để trống nếu không rõ):</label>
        <input id="remaining-running" type="number" min={1} max={360} value={remaining}
          onChange={e => setRemaining(e.target.value)} disabled={busy || uncertain} placeholder="Ví dụ: 12" />
        <button type="button" className="btn btn-outline" disabled={busy || uncertain || expired || (remaining !== '' && (!Number.isInteger(Number(remaining)) || Number(remaining) < 1 || Number(remaining) > 360))}
          onClick={() => void mutate(`holds/${hold.id}/report-running`, { remainingMinutes: remaining === '' ? null : Number(remaining) }, 'Đã ghi nhận báo còn chạy; lượt giữ được khôi phục về hàng.')}>
          Báo máy vẫn chạy
        </button>
        <p className="muted-note">Lần đầu có số phút hợp lệ sẽ dời ETA; lần sau hoặc không rõ thời gian cần quản lý xác minh.</p>
      </div>}
    </>}
    {handover === null && <>
      <p>Máy không còn mẻ cũ chưa bàn giao. Hãy xác nhận kiểm tra tại thẻ giữ lượt của A rồi mới bắt đầu.</p>
      <form onSubmit={start}>
        <label className="field"><span>Số phút giặt trên bảng máy (1–360)</span>
          <input type="number" required min={1} max={360} value={minutes} disabled={busy || uncertain}
            onChange={e => setMinutes(Number(e.target.value))} />
        </label>
        <label className="field"><span>Chế độ bàn giao</span>
          <select value={mode} disabled={busy || uncertain} onChange={e => setMode(e.target.value as HandoverMode)}>
            <option value="ALLOW_TRANSFER">Cho phép người sau chuyển đồ vào chậu</option>
            <option value="SELF_PICKUP">Tự lấy trước trong 10 phút từ giờ dự kiến</option>
          </select>
        </label>
        <p className="muted-note">Mỗi người tự mang và đặt chậu riêng cạnh máy. Giờ dự kiến không thay thế kiểm tra thực tế.</p>
        {!hold.physicallyChecked && <p role="status">Bạn chưa xác nhận kiểm tra tại máy.</p>}
        <div className="queue-actions">
          <button type="submit" className="btn btn-primary" disabled={!canStart}>Bắt đầu giặt</button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy || uncertain || expired}
            onClick={() => void mutate(`holds/${hold.id}/unusable`, undefined, 'Đã ghi nhận báo máy chưa dùng được; lượt giữ được khôi phục về hàng.')}
          >
            Báo máy chưa dùng được
          </button>
        </div>
      </form>
    </>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert" className="alert alert-error">{error}</p>}
    {uncertain && <button type="button" className="btn btn-outline" disabled={busy}
      onClick={() => void refresh().then(() => { setUncertain(false); setError(null); }).catch(() => setError('Tải lại thất bại.'))}>
      Tải lại trạng thái trước khi thao tác
    </button>}
  </section>;
}
