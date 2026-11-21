'use client';

import { useEffect, useRef, useState } from 'react';

export interface MachineHoldView {
  id: string;
  machineId: string;
  accountId: string;
  queueEntryId: string;
  expiresAt: string;
}

export interface MachineHoldCardProps {
  buildingId: string;
  accountId: string;
  /** Latest server snapshot for this building. Never reuse another building's data. */
  hold: MachineHoldView | null;
  machineLabel?: string;
  /** Parent owns fetching/polling. Must refresh holds AND building/queue state. */
  onRefresh: () => void | Promise<void>;
  onSessionExpired: () => void;
}

export default function MachineHoldCard(props: MachineHoldCardProps) {
  const { hold, buildingId, accountId } = props;
  if (!hold || hold.accountId !== accountId) return null;
  // Reset pending actions and local confirmations when account/building/hold changes.
  return <ActiveHoldCard key={`${buildingId}:${accountId}:${hold.id}`} {...props} hold={hold} />;
}

function ActiveHoldCard({
  buildingId, hold, machineLabel, onRefresh, onSessionExpired,
}: MachineHoldCardProps & { hold: MachineHoldView }) {
  const [now, setNow] = useState<number | null>(null);
  const [busy, setBusy] = useState<'confirm-check' | 'yield' | null>(null);
  const [checked, setChecked] = useState(false);
  const [yielded, setYielded] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const expiryNotified = useRef(false);
  const callbacks = useRef({ onRefresh, onSessionExpired });
  const deadline = Date.parse(hold.expiresAt);
  const invalidDeadline = !Number.isFinite(deadline);
  const expired = invalidDeadline || (now !== null && now >= deadline);
  const disabled = now === null || expired || yielded || needsRefresh || sessionExpired || busy !== null;

  useEffect(() => {
    callbacks.current = { onRefresh, onSessionExpired };
  }, [onRefresh, onSessionExpired]);

  useEffect(() => {
    mounted.current = true;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      controller.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!expired || expiryNotified.current) return;
    expiryNotified.current = true;
    // The countdown is display-only: Java decides expiry and allocation.
    void Promise.resolve().then(() => {
      if (mounted.current) return callbacks.current.onRefresh();
    }).catch(() => {
      if (mounted.current) setError('Không tải lại được trạng thái. Hãy bấm Tải lại trạng thái.');
    });
  }, [expired]);

  async function refresh() {
    try {
      await callbacks.current.onRefresh();
      if (mounted.current) setNeedsRefresh(false);
    } catch {
      if (mounted.current) setError('Không tải lại được trạng thái. Hãy bấm Tải lại trạng thái.');
    }
  }

  async function act(action: 'confirm-check' | 'yield') {
    // Recheck the clock on click; a background tab can have throttled timers.
    if (inFlight.current || disabled || Date.now() >= deadline) return;
    inFlight.current = true;
    setBusy(action);
    setError(null);
    setNotice(null);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await fetch(`/api/buildings/${buildingId}/holds/${hold.id}/${action}`, {
        method: 'POST',
        signal: abort.signal,
        cache: 'no-store',
      });
      if (!mounted.current) return;
      if (response.status === 401) {
        setSessionExpired(true);
        setNeedsRefresh(true);
        setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        callbacks.current.onSessionExpired();
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: unknown } | null;
        if (!mounted.current) return;
        setError(typeof body?.error === 'string' ? body.error : 'Không thể hoàn tất thao tác. Hãy tải lại trạng thái.');
        // A proxy/server error may occur after Java committed the action.
        // Never blindly retry a mutation with an unknown outcome.
        setNeedsRefresh(true);
        if (response.status === 409 || response.status === 404 || response.status === 403) {
          await refresh();
        }
        return;
      }
      if (action === 'confirm-check') {
        setChecked(true);
        setNotice('Đã ghi nhận kiểm tra tại máy. Đây chưa phải thao tác bắt đầu giặt.');
      } else {
        setYielded(true);
        setNotice('Đã nhường lượt. Vui lòng xem trạng thái hàng đợi mới.');
      }
      await refresh();
    } catch {
      if (mounted.current && !abort.signal.aborted) {
        setNeedsRefresh(true);
        setError('Mất kết nối, chưa rõ thao tác đã được ghi nhận hay chưa. Hãy tải lại trạng thái trước khi tiếp tục.');
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  const seconds = now === null || invalidDeadline ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
  const countdown = seconds === null ? '--:--' : `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

  return (
    <section className="panel" aria-label="Lượt giữ máy của bạn" aria-busy={busy !== null}>
      <h3>Máy được giao: {machineLabel ?? 'Máy của bạn'}</h3>
      <p>Thời gian còn lại: <strong role="timer" aria-label="Thời gian giữ máy còn lại">{countdown}</strong></p>
      <p className="muted-note">Hạn 8 phút tính ngay từ lúc giao máy. Đóng trang có thể khiến bạn bỏ lỡ lượt và không được tự gia hạn.</p>
      <p className="muted-note">Chỉ xác nhận khi đã kiểm tra máy tại chỗ: máy đã dừng và đồ cũ đã được lấy hoặc bàn giao. Xác nhận này không tự bắt đầu giặt hay gia hạn lượt.</p>
      {expired && <p role="status">{invalidDeadline ? 'Không đọc được hạn giữ máy.' : 'Đã tới hạn hiển thị.'} Đang cần trạng thái mới từ máy chủ; không khởi động máy khi chưa xác minh quyền sử dụng.</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      <div>
        <button type="button" className="btn btn-primary" disabled={disabled || checked} onClick={() => void act('confirm-check')}>
          {busy === 'confirm-check' ? 'Đang xác nhận…' : checked ? 'Đã ghi nhận kiểm tra' : 'Tôi đã kiểm tra máy tại chỗ'}
        </button>{' '}
        <button type="button" className="btn btn-danger" disabled={disabled} onClick={() => void act('yield')}>
          {busy === 'yield' ? 'Đang nhường…' : 'Nhường lượt'}
        </button>{' '}
        <button type="button" className="btn btn-outline" disabled={busy !== null} onClick={() => void refresh()}>Tải lại trạng thái</button>
      </div>
    </section>
  );
}
