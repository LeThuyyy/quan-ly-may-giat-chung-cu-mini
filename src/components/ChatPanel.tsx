'use client';

import { useEffect, useRef, useState } from 'react';

export type ChatMessage = { id: string; authorId: string; displayName: string; body: string | null; sentAt: string; hiddenAt: string | null };
export type ChatReport = { id: string; messageId: string; reporterId: string; reasonCode: string; reportedAt: string };
type Page<T> = { items: T[]; page: number; size: number; hasNext: boolean };
export type ChatPanelProps = { buildingId: string; accountId: string; isManager?: boolean; onSessionExpired: () => void };

// Mount only on the active chat tab. Changing authority creates a new request scope.
export default function ChatPanel(props: ChatPanelProps) {
  return <ChatScope key={`${props.buildingId}:${props.accountId}:${!!props.isManager}`} {...props} />;
}
function ChatScope({ buildingId, isManager = false, onSessionExpired }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reports, setReports] = useState<ChatReport[]>([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [draft, setDraft] = useState('');
  const [reason, setReason] = useState('SPAM');
  const [blocked, setBlocked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const requestId = useRef<string | null>(null);
  const poll = useRef<() => Promise<void>>(async () => {});
  const expired = useRef(onSessionExpired);
  useEffect(() => { expired.current = onSessionExpired; }, [onSessionExpired]);
  const base = `/api/buildings/${buildingId}/chat`;

  async function checked(path: string, signal: AbortSignal, init?: RequestInit) {
    const response = await fetch(path, { ...init, cache: 'no-store', signal });
    if (!mounted.current || signal.aborted) throw new Error('Yêu cầu đã đổi phạm vi.');
    if (response.status === 401) expired.current();
    if (!response.ok) throw new Error(response.status === 403 ? 'Bạn không còn quyền truy cập.' : response.status === 429 ? 'Chờ 5 giây rồi tải lại trước khi gửi.' : 'Không thể hoàn tất. Hãy tải lại trước khi thao tác.');
    return response.json();
  }
  async function load(targetPage: number, signal: AbortSignal) {
    const result: Page<ChatMessage> = await checked(`${base}/messages?page=${targetPage}&size=30`, signal);
    const reportResult: Page<ChatReport> | null = isManager ? await checked(`${base}/reports?page=${targetPage}&size=30`, signal) : null;
    if (!mounted.current || signal.aborted) return;
    setMessages(result.items); setHasNext(result.hasNext || !!reportResult?.hasNext); setPage(targetPage);
    setReports(reportResult?.items ?? []); setBlocked(false); setError('');
  }
  async function run(action?: { path: string; payload: object }, targetPage = page) {
    if (!mounted.current || inFlight.current || document.hidden) return;
    inFlight.current = true; setBusy(true);
    if (action) { setBlocked(true); setMutating(true); }
    const scope = new AbortController(); controller.current = scope;
    try {
      if (action) {
        await checked(action.path, scope.signal, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action.payload) });
        if (mounted.current && !scope.signal.aborted && action.path === `${base}/messages`) {
          setDraft(''); requestId.current = null;
        }
      }
      await load(targetPage, scope.signal);
    } catch (cause) {
      if (mounted.current && !scope.signal.aborted) {
        setBlocked(true);
        setError(cause instanceof Error ? cause.message : 'Không thể tải tin nhắn.');
      }
    } finally {
      if (mounted.current && controller.current === scope) { inFlight.current = false; setBusy(false); setMutating(false); }
    }
  }
  useEffect(() => { poll.current = () => run(); });
  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(() => run(undefined, 0));
    let active = true;
    let timer: number;
    const tick = async () => {
      if (document.visibilityState === 'visible') await poll.current();
      if (active) timer = window.setTimeout(() => void tick(), 5000);
    };
    timer = window.setTimeout(() => void tick(), 5000);
    function visibility() {
      if (document.hidden) { controller.current?.abort(); setBlocked(true); }
      else void run();
    }
    document.addEventListener('visibilitychange', visibility);
    return () => { active = false; window.clearTimeout(timer); mounted.current = false; controller.current?.abort(); document.removeEventListener('visibilitychange', visibility); };
    // One scope per keyed mount; only read polling while mounted, no automatic mutation retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const disabled = busy || blocked;
  function send() {
    if (disabled || !draft.trim() || draft.trim().length > 1000) return;
    requestId.current ??= crypto.randomUUID();
    // Keep UUID and draft for deliberate idempotent retries; editing starts a new message.
    void run({ path: `${base}/messages`, payload: { clientRequestId: requestId.current, body: draft.trim() } }, 0);
  }
  return <section className="panel" aria-label="Trò chuyện tòa nhà">
    <div className="panel-head">
      <h2>Trò chuyện tòa nhà</h2>
      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void run()}>Tải lại trò chuyện</button>
    </div>
    <p className="muted-note">Tin nhắn văn bản được lưu 30 ngày. Báo cáo không tự động ẩn tin nhắn.</p>
    {error && <p className="alert alert-error" role="alert">{error}</p>}
    <ul className="chat-list">{messages.map(message => <li className="chat-item" key={message.id}>
      <div className="chat-item-head">
        <strong>{message.displayName}</strong>
        <time dateTime={message.sentAt}>{new Date(message.sentAt).toLocaleString('vi-VN')}</time>
      </div>
      <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.hiddenAt ? 'Tin nhắn đã bị ẩn.' : message.body}</p>
      {!message.hiddenAt && <div className="action-row">
        <button type="button" className="btn btn-outline btn-sm" disabled={disabled} onClick={() => void run({ path: `${base}/messages/${message.id}/report`, payload: { reasonCode: reason } })}>Báo cáo tin nhắn của {message.displayName}</button>
        {isManager && <button type="button" className="btn btn-danger btn-sm" disabled={disabled} onClick={() => void run({ path: `${base}/messages/${message.id}/hide`, payload: { reasonCode: reason } })}>Ẩn tin nhắn của {message.displayName}</button>}
      </div>}
    </li>)}</ul>
    <label className="field">Lý do báo cáo / ẩn <select value={reason} onChange={event => setReason(event.target.value)} disabled={disabled}>
      <option value="SPAM">Spam</option><option value="ABUSE">Lạm dụng</option><option value="OTHER">Khác</option>
    </select></label>
    {isManager && <section className="swap-subpanel" aria-label="Báo cáo tin nhắn"><h3>Báo cáo</h3><ul className="queue-list">{reports.map(report => <li className="queue-row" key={report.id}>
      <span>Tin {report.messageId} — {report.reasonCode}</span>
      <button type="button" className="btn btn-danger btn-sm" disabled={disabled} onClick={() => void run({ path: `${base}/messages/${report.messageId}/hide`, payload: { reasonCode: reason } })}>Ẩn tin được báo cáo</button>
    </li>)}</ul></section>}
    <div className="action-row">
      <button type="button" className="btn btn-outline btn-sm" disabled={busy || page === 0} onClick={() => void run(undefined, page - 1)}>Trang trước</button>
      <button type="button" className="btn btn-outline btn-sm" disabled={busy || !hasNext} onClick={() => void run(undefined, page + 1)}>Trang sau</button>
    </div>
    <div className="chat-composer">
      <label className="field">Tin nhắn <textarea value={draft} maxLength={1000} disabled={mutating || blocked} placeholder="Nhập nội dung trao đổi chung trong tòa…" onChange={event => { setDraft(event.target.value); requestId.current = null; }} /></label>
      <button type="button" className="btn btn-primary" disabled={disabled || !draft.trim()} onClick={send}>Gửi tin nhắn</button>
    </div>
  </section>;
}
