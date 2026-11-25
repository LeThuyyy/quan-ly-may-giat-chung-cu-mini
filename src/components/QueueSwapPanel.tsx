'use client';
import { useEffect, useRef, useState } from 'react';
import type { QueueEntryView } from './QueuePanel';
interface Swap { id: string; senderId: string; recipientId: string; senderEntryId: string; recipientEntryId: string; expiresAt: string; status: string }
interface Props { buildingId: string; accountId: string; entries: QueueEntryView[]; refreshKey?: number; onRefresh: () => Promise<void>; onSessionExpired: () => void }
export default function QueueSwapPanel(props: Props) { return <SwapScope key={`${props.buildingId}:${props.accountId}`} {...props} />; }
function SwapScope({ buildingId, accountId, entries, refreshKey = 0, onRefresh, onSessionExpired }: Props) {
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(true);
  const [blocked, setBlocked] = useState(true);
  const [error, setError] = useState('');
  const mounted = useRef(false), inFlight = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const callbacks = useRef({ onRefresh, onSessionExpired });
  useEffect(() => { callbacks.current = { onRefresh, onSessionExpired }; }, [onRefresh, onSessionExpired]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; pending.current?.abort(); }; }, []);
  async function load(signal: AbortSignal) {
    const response = await fetch(`/api/buildings/${buildingId}/swaps`, { cache: 'no-store', signal });
    if (!mounted.current || signal.aborted) return;
    if (response.status === 401) callbacks.current.onSessionExpired();
    if (!response.ok) throw new Error('Không tải được lời mời. Hãy tải lại trước khi thao tác.');
    const data = await response.json();
    if (mounted.current && !signal.aborted) { setSwaps(data.items); setBlocked(false); setError(''); }
  }
  async function run(action?: 'create' | 'accept' | 'reject' | 'cancel', id?: string) {
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
      await load(controller.signal);
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
  const outgoing = swaps.some(s => s.senderId === accountId && s.status === 'PENDING');
  const disabled = busy || blocked;
  const names = new Map(entries.map(e => [e.accountId,e.displayName]));
  const statusNames: Record<string,string> = { PENDING: 'Chờ trả lời', ACCEPTED: 'Đã đổi', REJECTED: 'Từ chối', CANCELLED: 'Đã hủy', EXPIRED: 'Hết hạn', INVALIDATED: 'Mất hiệu lực' };
  return <section className="panel" aria-label="Đổi lượt trong hàng">
    <h3>Đổi lượt</h3><p>Chỉ đổi đúng hai vị trí đang chờ, không đổi Sẵn sàng. Lời mời có hiệu lực 10 phút; nhận máy hoặc rời hàng làm lời mời mất hiệu lực.</p>
    {targets.length > 0 && <><label>Người phía sau<select value={selected} disabled={disabled || outgoing} onChange={e => setSelected(e.target.value)}>
      <option value="">Chọn người đổi lượt</option>{targets.map(e => <option key={e.id} value={e.id}>{e.displayName} · vị trí {sorted.indexOf(e)+1}</option>)}
    </select></label><p>Bạn ở vị trí {ownIndex+1}; đồng ý sẽ hoán đổi với vị trí {selected ? sorted.findIndex(e=>e.id===selected)+1 : 'được chọn'}.</p>
      <button type="button" disabled={disabled || outgoing || !targets.some(e=>e.id===selected)} onClick={() => void run('create')}>Gửi lời mời đổi lượt</button></>}
    {outgoing && <p>Bạn đã có một lời mời đang chờ.</p>}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy} onClick={() => void run()}>Tải lại lời mời</button>
    <ul>{swaps.map(s => <li key={s.id}>{names.get(s.senderId) ?? 'Người gửi'} → {names.get(s.recipientId) ?? 'Người nhận'} · {statusNames[s.status] ?? s.status} · hạn {new Date(s.expiresAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
      {s.status === 'PENDING' && (s.senderId === accountId ? <button disabled={disabled} onClick={() => void run('cancel',s.id)}>Hủy lời mời</button> : <><button disabled={disabled} onClick={() => void run('accept',s.id)}>Đồng ý đổi lượt</button><button disabled={disabled} onClick={() => void run('reject',s.id)}>Từ chối đổi lượt</button></>)}
    </li>)}</ul>
  </section>;
}
