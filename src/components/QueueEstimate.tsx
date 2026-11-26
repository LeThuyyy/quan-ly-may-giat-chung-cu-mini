'use client';
import { useEffect, useRef, useState } from 'react';

export interface QueueEstimateView {
  state: 'READY' | 'UNREADY' | 'NOT_WAITING' | 'UNAVAILABLE';
  rank: number | null; readyAhead: number | null;
  rangeStart: string | null; rangeEnd: string | null; serverNow: string;
  assumptions: string[]; reason: string;
}
const time = (value: string) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
export default function QueueEstimate(props: { buildingId: string; accountId: string; refreshKey?: number; onSessionExpired: () => void }) {
  return <EstimatePanel key={`${props.buildingId}:${props.accountId}`} {...props} />;
}
function EstimatePanel({ buildingId, refreshKey = 0, onSessionExpired }: { buildingId: string; accountId: string; refreshKey?: number; onSessionExpired: () => void }) {
  const [estimate, setEstimate] = useState<QueueEstimateView | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(true);
  const callback = useRef(onSessionExpired);
  useEffect(() => { callback.current = onSessionExpired; }, [onSessionExpired]);
  useEffect(() => {
    const abort = new AbortController(); let active = true;
    async function load() {
      setBusy(true); setEstimate(null); setError('');
      try {
        const response = await fetch(`/api/buildings/${buildingId}/eta/me`, { cache: 'no-store', signal: abort.signal });
        if (!active) return;
        if (response.status === 401) { callback.current(); return; }
        if (!response.ok) throw new Error('Không tải được ước tính. Hãy kiểm tra quyền truy cập và thử lại.');
        const data = await response.json() as QueueEstimateView;
        if (active) setEstimate(data);
      } catch (e) { if (active && !abort.signal.aborted) setError(e instanceof Error ? e.message : 'Không tải được ước tính.'); }
      finally { if (active) setBusy(false); }
    }
    void load();
    return () => { active = false; abort.abort(); };
  }, [buildingId, refreshKey, version]);
  return <section className="panel" aria-label="Ước tính tới lượt">
    <div className="panel-head">
      <h3>Ước tính tới lượt</h3>
      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => setVersion(v => v + 1)}>Tải lại ước tính</button>
    </div>
    {busy && <p className="muted-note" role="status">Đang tải ước tính…</p>}
    {error && <p className="alert alert-error" role="alert">{error}</p>}
    {estimate && <>
      <div className={estimate.state === 'READY' ? 'eta-callout eta-callout-ready' : 'eta-callout'}>
        <p><strong>{estimate.reason}</strong></p>
        {estimate.rank !== null && <p>Vị trí chờ: <strong>{estimate.rank}</strong>. Người sẵn sàng phía trước: <strong>{estimate.readyAhead}</strong>.</p>}
        {estimate.state === 'READY' && estimate.rangeStart && estimate.rangeEnd && <p>Dự kiến: <strong>{time(estimate.rangeStart)} – {time(estimate.rangeEnd)}</strong> (giờ Việt Nam).</p>}
      </div>
      <ul className="assumptions-list">{estimate.assumptions.map(a => <li key={a}>{a}</li>)}</ul>
      <small className="muted-note">Cập nhật từ máy chủ: {time(estimate.serverNow)}</small>
    </>}
  </section>;
}
