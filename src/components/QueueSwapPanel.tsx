'use client';
import { useEffect, useRef, useState } from 'react';
import type { QueueEntryView } from './QueuePanel';
import { RefreshIcon, SwapIcon } from './Icons';
interface Swap { id: string; senderId: string; recipientId: string; senderEntryId: string; recipientEntryId: string; expiresAt: string; status: string }
interface SwapPage { items: Swap[]; page: number; size: number; hasNext: boolean }
type View = 'pending' | 'history';
interface Props { buildingId: string; accountId: string; entries: QueueEntryView[]; refreshKey?: number; onRefresh: () => Promise<void>; onSessionExpired: () => void }
const PAGE_SIZE = 20;
export default function QueueSwapPanel(props: Props) { return <SwapScope key={`${props.buildingId}:${props.accountId}`} {...props} />; }
function SwapScope({ buildingId, accountId, entries, refreshKey = 0, onRefresh, onSessionExpired }: Props) {
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [outgoing, setOutgoing] = useState<Swap[]>([]);
  const [view, setView] = useState<View>('pending');
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(true);
  const [blocked, setBlocked] = useState(true);
  const [error, setError] = useState('');
  const mounted = useRef(false), inFlight = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const callbacks = useRef({ onRefresh, onSessionExpired });
  useEffect(() => { callbacks.current = { onRefresh, onSessionExpired }; }, [onRefresh, onSessionExpired]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; pending.current?.abort(); }; }, []);

  async function load(signal: AbortSignal, targetView: View, targetPage: number) {
    const root = `/api/buildings/${buildingId}/swaps`;
    // Outgoing requests are independent of history and inbox pagination. The user's
    // one actionable outgoing invitation must remain cancellable on every page.
    const responses = await Promise.all([
      fetch(`${root}${targetView === 'pending' ? '/pending' : ''}?page=${targetPage}&size=${PAGE_SIZE}`, { cache: 'no-store', signal }),
      fetch(`${root}/outgoing`, { cache: 'no-store', signal }),
    ]);
    if (!mounted.current || signal.aborted) return;
    if (responses.some(response => response.status === 401)) callbacks.current.onSessionExpired();
    if (responses.some(response => !response.ok)) throw new Error('Không tải được lời mời. Hãy tải lại trước khi thao tác.');
    const [data, sent] = await Promise.all(responses.map(response => response.json())) as [SwapPage, Swap[]];
    if (!mounted.current || signal.aborted) return;
    if (!Array.isArray(data.items) || data.page !== targetPage || data.size !== PAGE_SIZE
      || typeof data.hasNext !== 'boolean' || !Array.isArray(sent)) throw new Error('Dữ liệu lời mời chưa được xác minh.');
    setSwaps(data.items); setOutgoing(sent); setHasNext(data.hasNext);
    setView(targetView); setPage(targetPage); setBlocked(false); setError('');
  }
  async function run(action?: 'create' | 'accept' | 'reject' | 'cancel', id?: string, targetView = view, targetPage = page) {
    if (!mounted.current || inFlight.current) return;
    inFlight.current = true; setBusy(true); setBlocked(true);
    const controller = new AbortController(); pending.current = controller;
    try {
      if (action) {
        const response = await fetch(`/api/buildings/${buildingId}/swaps${action === 'create' ? '' : `/${id}/${action}`}`, {
          method: 'POST', cache: 'no-store', signal: controller.signal,
          ...(action === 'create' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipientEntryId: selected }) } : {}),
        });
        if (!mounted.current || controller.signal.aborted) return;
        if (response.status === 401) callbacks.current.onSessionExpired();
        if (!response.ok) throw new Error('Lời mời không còn hợp lệ hoặc bạn không có quyền. Hãy tải lại.');
        await callbacks.current.onRefresh();
        if (!mounted.current || controller.signal.aborted) return;
        setSelected('');
      }
      await load(controller.signal, targetView, targetPage);
    } catch (e) { if (mounted.current && !controller.signal.aborted) setError(e instanceof Error ? e.message : 'Chưa rõ kết quả. Hãy tải lại, không gửi lặp.'); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  useEffect(() => { void Promise.resolve().then(() => run());
    // Parent refresh coalesces operational updates; no separate polling loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);
  const sorted = [...entries].sort((a,b) => a.position-b.position);
  const ownIndex = sorted.findIndex(e => e.accountId === accountId);
  const targets = ownIndex < 0 ? [] : sorted.slice(ownIndex+1);
  const hasOutgoing = outgoing.some(s => s.status === 'PENDING');
  const disabled = busy || blocked;
  const names = new Map(entries.map(e => [e.accountId,e.displayName]));
  const statusNames: Record<string,string> = { PENDING: 'Chờ trả lời', ACCEPTED: 'Đã đổi', REJECTED: 'Từ chối', CANCELLED: 'Đã hủy', EXPIRED: 'Hết hạn', INVALIDATED: 'Mất hiệu lực' };
  const outgoingIds = new Set(outgoing.map(s => s.id));
  function row(s: Swap) {
    return <li className="queue-row" key={s.id}>
      <span>{names.get(s.senderId) ?? 'Người gửi'} → {names.get(s.recipientId) ?? 'Người nhận'} · {statusNames[s.status] ?? s.status} · hạn {new Date(s.expiresAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</span>
      {s.status === 'PENDING' && (s.senderId === accountId ? <button type="button" className="btn btn-danger btn-sm" disabled={disabled} onClick={() => void run('cancel',s.id)}>Hủy lời mời</button> : <div className="action-row"><button type="button" className="btn btn-primary btn-sm" disabled={disabled} onClick={() => void run('accept',s.id)}>Đồng ý đổi lượt</button><button type="button" className="btn btn-danger btn-sm" disabled={disabled} onClick={() => void run('reject',s.id)}>Từ chối đổi lượt</button></div>)}
    </li>;
  }
  return <section className="panel" aria-label="Đổi lượt trong hàng">
    <div className="panel-head">
      <h3 className="panel-title"><SwapIcon /> Đổi lượt</h3>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void run()}><RefreshIcon /> Tải lại lời mời</button>
    </div>
    <p className="muted-note">Chỉ đổi đúng hai vị trí đang chờ, không đổi Sẵn sàng. Lời mời có hiệu lực 10 phút; nhận máy hoặc rời hàng làm lời mời mất hiệu lực.</p>
    {targets.length > 0 && <div className="swap-subpanel">
      <label className="field"><span>Người phía sau</span><select value={selected} disabled={disabled || hasOutgoing} onChange={e => setSelected(e.target.value)}>
        <option value="">Chọn người đổi lượt</option>{targets.map(e => <option key={e.id} value={e.id}>{e.displayName} · vị trí {sorted.indexOf(e)+1}</option>)}
      </select></label>
      <p className="muted-note">Bạn ở vị trí {ownIndex+1}; đồng ý sẽ hoán đổi với vị trí {selected ? sorted.findIndex(e=>e.id===selected)+1 : 'được chọn'}.</p>
      <button type="button" className="btn btn-primary btn-sm" disabled={disabled || hasOutgoing || !targets.some(e=>e.id===selected)} onClick={() => void run('create')}>Gửi lời mời đổi lượt</button>
    </div>}
    {hasOutgoing && <p className="muted-note">Bạn đã có một lời mời đang chờ.</p>}
    <section className="swap-subpanel" aria-label="Lời mời bạn đã gửi đang chờ"><h4>Lời mời bạn đã gửi đang chờ</h4>
      {outgoing.length ? <ul className="queue-list">{outgoing.map(row)}</ul> : <p className="muted-note" style={{ margin: 0 }}>Không có lời mời gửi đang chờ.</p>}
    </section>
    {error && <p className="alert alert-error" role="alert">{error}</p>}
    <div className="action-row">
      <button type="button" className="btn btn-outline btn-sm" disabled={disabled} aria-pressed={view === 'pending'} onClick={() => void run(undefined, undefined, 'pending', 0)}>Lời mời đang chờ</button>
      <button type="button" className="btn btn-outline btn-sm" disabled={disabled} aria-pressed={view === 'history'} onClick={() => void run(undefined, undefined, 'history', 0)}>Lịch sử đổi lượt</button>
    </div>
    <ul className="queue-list">{swaps.filter(s => !outgoingIds.has(s.id)).map(row)}</ul>
    <div className="pagination-bar" aria-label="Phân trang lời mời">
      <button type="button" className="btn btn-outline btn-sm" disabled={disabled || page === 0} onClick={() => void run(undefined, undefined, view, page - 1)}>Trang lời mời trước</button>
      <span>Trang {page + 1}</span>
      <button type="button" className="btn btn-outline btn-sm" disabled={disabled || !hasNext} onClick={() => void run(undefined, undefined, view, page + 1)}>Trang lời mời sau</button>
    </div>
  </section>;
}
