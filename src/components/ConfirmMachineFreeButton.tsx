'use client';

import { useEffect, useId, useRef, useState } from 'react';

export interface ConfirmMachineFreeButtonProps {
  buildingId: string;
  accountId: string;
  isManager: boolean;
  machine: { id: string; label: string; status: string };
  /** null means holds have not been loaded or could not be verified. */
  hasActiveHold: boolean | null;
  /** Refresh machines, queue, holds and personal status; reject if any load fails. */
  onRefresh: () => Promise<void>;
  onSessionExpired: () => void;
}

export default function ConfirmMachineFreeButton(props: ConfirmMachineFreeButtonProps) {
  if (!props.isManager) return null;
  const { buildingId, accountId, machine, hasActiveHold } = props;
  return <ScopedConfirmFree key={`${buildingId}:${accountId}:${machine.id}:${machine.status}:${hasActiveHold}`} {...props} />;
}

function ScopedConfirmFree({ buildingId, machine, hasActiveHold, onRefresh, onSessionExpired }: ConfirmMachineFreeButtonProps) {
  const [expanded, setExpanded] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const confirmationId = useId();
  const panelId = useId();
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const callbacks = useRef({ onRefresh, onSessionExpired });
  // Fail closed for unknown/future states; Java remains the authority for permission and state.
  const eligible = (machine.status === 'AVAILABLE' || machine.status === 'NEEDS_CHECK') && hasActiveHold === false;
  const disabled = !eligible || busy || needsRefresh || completed || accessDenied;

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
      if (mounted.current) {
        setNeedsRefresh(false);
        setChecked(false); // Never reuse a physical confirmation after an uncertain outcome.
        setError(null);
      }
    } catch {
      if (mounted.current) {
        setNeedsRefresh(true);
        setError('Không tải lại được trạng thái. Chưa thể xác nhận máy trống.');
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function confirm() {
    if (disabled || !checked || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    pending.current = controller;
    try {
      const response = await fetch(`/api/buildings/${buildingId}/machines/${machine.id}/confirm-free`, {
        method: 'POST', cache: 'no-store', signal: controller.signal,
      });
      if (!mounted.current) return;
      if (response.status === 401) {
        setAccessDenied(true);
        setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        callbacks.current.onSessionExpired();
        return;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: unknown } | null;
        if (!mounted.current) return;
        if (response.status === 403) setAccessDenied(true);
        setNeedsRefresh(true);
        setChecked(false);
        setError(typeof payload?.error === 'string' ? payload.error : 'Không xác nhận được máy trống. Hãy tải lại trạng thái trước khi tiếp tục.');
        return;
      }
      setCompleted(true);
      setNotice('Đã ghi nhận máy trống. Máy có thể được giao ngay cho người đang sẵn sàng; hãy xem trạng thái mới từ máy chủ.');
      try {
        await callbacks.current.onRefresh();
      } catch {
        if (mounted.current) setError('Đã ghi nhận xác nhận nhưng chưa tải được trạng thái mới. Không gửi lại; hãy tải lại trạng thái.');
      }
    } catch {
      if (mounted.current && !controller.signal.aborted) {
        setNeedsRefresh(true);
        setChecked(false);
        setError('Mất kết nối, chưa rõ xác nhận đã được ghi nhận hay chưa. Hãy tải lại trạng thái, không gửi lặp.');
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const blockedReason = machine.status === 'RUNNING' ? 'Máy đang chạy, không thể xác nhận trống.'
    : machine.status === 'MAINTENANCE' ? 'Máy đang bảo trì. Mở bảo trì không tự xác nhận máy trống.'
    : hasActiveHold === true ? 'Máy đang có lượt giữ. Cần xử lý lượt trước.'
    : hasActiveHold === null ? 'Chưa xác minh được lượt giữ của máy. Hãy tải lại trạng thái.'
    : !eligible ? 'Trạng thái máy chưa hỗ trợ xác nhận trống.' : null;

  return (
    <div role="group" aria-label={`Xác nhận máy trống: ${machine.label}`} aria-busy={busy} style={{ display: 'contents' }}>
      <button type="button" className="btn btn-outline btn-sm" disabled={disabled} aria-expanded={expanded} aria-controls={panelId}
        onClick={() => { setExpanded((value) => !value); setChecked(false); }}>
        {completed ? 'Đã ghi nhận máy trống' : 'Xác nhận máy trống'}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void refresh()}>Tải lại trạng thái</button>
      {blockedReason && <p className="muted-note" style={{ width: '100%', margin: 0 }}>{blockedReason}</p>}
      {expanded && (
        <div id={panelId} className="swap-subpanel" style={{ width: '100%', margin: '4px 0 0' }}>
          <p>Chỉ xác nhận sau khi đã kiểm tra thực tế {machine.label}: máy đã dừng, lồng giặt trống và không còn đồ chờ bàn giao. Đồng hồ về 0 không chứng minh máy đã dừng.</p>
          <p className="muted-note">Thao tác này có thể giao máy ngay và bắt đầu hạn 8 phút cho người sẵn sàng đầu tiên. Không dùng để kết thúc hoặc bỏ qua mẻ giặt/bàn giao.</p>
          <label className="checkbox-label" htmlFor={confirmationId}>
            <input id={confirmationId} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => setChecked(event.target.checked)} />
            <span>Tôi đã kiểm tra tại chỗ: máy đã dừng và lồng giặt trống</span>
          </label>
          <div className="action-row">
            <button type="button" className="btn btn-primary btn-sm" disabled={disabled || !checked} onClick={() => void confirm()}>
              {busy ? 'Đang xử lý…' : 'Ghi nhận máy trống'}
            </button>
            <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => { setExpanded(false); setChecked(false); }}>Hủy</button>
          </div>
        </div>
      )}
      {notice && <p className="alert alert-ok" role="status" style={{ width: '100%', margin: 0 }}>{notice}</p>}
      {error && <p role="alert" className="alert alert-error" style={{ width: '100%', margin: 0 }}>{error}</p>}
    </div>
  );
}
