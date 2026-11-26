'use client';

import { useEffect, useRef, useState } from 'react';

export interface QueueEntryView {
  id: string;
  accountId: string;
  displayName: string;
  /** Persistent order key, not the displayed row number. */
  position: number;
  ready: boolean;
}

export type QueueParticipation = 'NONE' | 'WAITING' | 'HELD' | 'WASHING' | 'UNKNOWN';

export interface QueuePanelProps {
  buildingId: string;
  accountId: string;
  entries: QueueEntryView[];
  /** Must come from a coherent server snapshot, never from absence in the waiting list alone. */
  participation: QueueParticipation;
  onRefresh: () => Promise<void>;
  onSessionExpired: () => void;
}

export default function QueuePanel(props: QueuePanelProps) {
  const own = props.entries.find((entry) => entry.accountId === props.accountId);
  // A fresh server state resets local outcomes; changing building/account aborts old requests.
  const scope = `${props.buildingId}:${props.accountId}:${props.participation}:${own?.id ?? ''}:${own?.ready ?? ''}`;
  return <ScopedQueuePanel key={scope} {...props} />;
}

function ScopedQueuePanel({ buildingId, accountId, entries, participation, onRefresh, onSessionExpired }: QueuePanelProps) {
  const [busy, setBusy] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const callbacks = useRef({ onRefresh, onSessionExpired });
  const ordered = [...entries].sort((a, b) => a.position - b.position);
  const ownIndex = ordered.findIndex((entry) => entry.accountId === accountId);
  const own = ordered[ownIndex];
  const consistent = participation === 'WAITING' ? !!own : !own;
  const disabled = busy || needsRefresh || completed || sessionExpired || !consistent || participation === 'UNKNOWN';

  useEffect(() => { callbacks.current = { onRefresh, onSessionExpired }; }, [onRefresh, onSessionExpired]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pending.current?.abort(); };
  }, []);

  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await callbacks.current.onRefresh();
      if (mounted.current) { setNeedsRefresh(false); setError(null); }
    } catch {
      if (mounted.current) {
        setNeedsRefresh(true);
        setError('Không tải lại được hàng đợi. Hãy thử tải lại trước khi thao tác.');
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function mutate(method: 'POST' | 'PATCH' | 'DELETE', ready?: boolean) {
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    const controller = new AbortController();
    pending.current = controller;
    try {
      const response = await fetch(`/api/buildings/${buildingId}/queue${method === 'POST' ? '' : '/me'}`, {
        method,
        cache: 'no-store',
        signal: controller.signal,
        ...(ready === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ready }) }),
      });
      if (!mounted.current) return;
      if (response.status === 401) {
        setSessionExpired(true);
        setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        callbacks.current.onSessionExpired();
        return;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: unknown } | null;
        if (!mounted.current) return;
        setNeedsRefresh(true);
        setError(typeof payload?.error === 'string' ? payload.error : 'Không thực hiện được thao tác. Hãy tải lại trạng thái.');
        return;
      }
      // No optimistic queue edits: a ready action may immediately become a hold.
      setCompleted(true);
      setNotice(method === 'DELETE' ? 'Đã rời hàng. Vào lại sẽ nhận thứ tự mới.' : 'Đã ghi nhận yêu cầu. Đang cập nhật hàng đợi và lượt giữ từ máy chủ.');
      try {
        await callbacks.current.onRefresh();
      } catch {
        if (mounted.current) setError('Thao tác đã được ghi nhận nhưng chưa tải lại được trạng thái. Hãy bấm Tải lại trạng thái.');
      }
    } catch {
      if (mounted.current && !controller.signal.aborted) {
        setNeedsRefresh(true);
        setError('Mất kết nối, chưa rõ thao tác đã được ghi nhận hay chưa. Hãy tải lại trạng thái, không gửi lặp.');
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <section className="panel" aria-label="Hàng đợi của tòa" aria-busy={busy}>
      <div className="panel-head">
        <h3>Hàng đợi chung</h3>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void refresh()}>Tải lại trạng thái</button>
      </div>
      <p className="muted-note">Người chưa sẵn sàng giữ vị trí nhưng được bỏ qua khi giao máy. Vị trí không phải cam kết giờ nhận máy.</p>
      {ordered.length === 0 ? <p>Chưa có người đang chờ.</p> : (
        <ol className="queue-list">
          {ordered.map((entry) => (
            <li key={entry.id} className={entry.accountId === accountId ? 'queue-row me' : 'queue-row'} aria-current={entry.accountId === accountId ? 'true' : undefined}>
              <span className="queue-row-main"><strong>{entry.displayName}{entry.accountId === accountId ? ' (Bạn)' : ''}</strong></span><span className="visually-hidden"> — </span><span className={entry.ready ? 'pill pill-ready' : 'pill pill-wait'}>{entry.ready ? 'Sẵn sàng nhận máy' : 'Chưa sẵn sàng'}</span>
            </li>
          ))}
        </ol>
      )}
      {consistent && participation === 'WAITING' && own && (
        <>
          <p>Vị trí của bạn: <strong>{ownIndex + 1}</strong>. Người sẵn sàng phía trước: <strong>{ordered.slice(0, ownIndex).filter((entry) => entry.ready).length}</strong>.</p>
          <div className="queue-actions">
            <button type="button" className="btn btn-primary" disabled={disabled} onClick={() => void mutate('PATCH', !own.ready)}>
              {own.ready ? 'Chuyển sang Chưa sẵn sàng' : 'Bật Sẵn sàng nhận máy'}
            </button>{' '}
            <button type="button" className="btn btn-danger" disabled={disabled} onClick={() => void mutate('DELETE')}>Rời hàng</button>
          </div>
        </>
      )}
      {consistent && participation === 'NONE' && (
        <div className="queue-actions">
          <button type="button" className="btn btn-primary" disabled={disabled} onClick={() => void mutate('POST', true)}>Vào hàng — Sẵn sàng</button>{' '}
          <button type="button" className="btn btn-outline" disabled={disabled} onClick={() => void mutate('POST', false)}>Vào hàng — Chưa sẵn sàng</button>
        </div>
      )}
      {participation === 'HELD' && consistent && <p>Bạn đã được giao máy. Hãy dùng thẻ giữ máy để xác nhận kiểm tra hoặc nhường lượt; không thể tắt Sẵn sàng hay rời hàng ở đây.</p>}
      {participation === 'WASHING' && consistent && <p>Bạn còn yêu cầu giặt chưa hoàn tất. Hoàn tất giặt và bàn giao trước khi vào hàng lại.</p>}
      {(!consistent || participation === 'UNKNOWN') && <p role="status">Chưa xác minh được yêu cầu hiện tại. Hãy tải lại trạng thái; chưa thể thao tác hàng đợi.</p>}
      <p className="muted-note">Chỉ bật Sẵn sàng khi có thể nhận máy trong 8 phút bất cứ lúc nào. Đóng trang có thể làm bạn bỏ lỡ lượt, không tự tắt Sẵn sàng hoặc gia hạn.</p>
      {notice && <p className="alert alert-ok" role="status">{notice}</p>}
      {error && <p role="alert" className="alert alert-error">{error}</p>}
    </section>
  );
}
