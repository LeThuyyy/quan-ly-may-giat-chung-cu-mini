'use client';

import { useEffect, useRef, useState } from 'react';
import { SwapIcon } from '@/components/Icons';
import type { QueueEntryView } from '@/components/QueuePanel';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';

interface Swap {
  id: string;
  senderId: string;
  recipientId: string;
  senderEntryId: string;
  recipientEntryId: string;
  expiresAt: string;
  status: string;
}

interface SwapPage {
  items: Swap[];
  page: number;
  size: number;
  hasNext: boolean;
}

type SwapTab = 'incoming' | 'outgoing' | 'history';

interface SwapsViewProps {
  buildingId: string;
  buildingName: string;
  accountId: string;
  entries: QueueEntryView[];
  refreshKey: number;
  onRefresh: () => Promise<void>;
  onSessionExpired: () => void;
}

const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 12000;
const REQUEST_TIMEOUT_MS = 15000;

const STATUS_UI: Record<string, { label: string; tone: 'warning' | 'success' | 'error' | 'neutral' }> = {
  PENDING: { label: 'Chờ trả lời', tone: 'warning' },
  ACCEPTED: { label: 'Đã đổi lượt', tone: 'success' },
  REJECTED: { label: 'Từ chối', tone: 'error' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
  EXPIRED: { label: 'Hết hạn', tone: 'neutral' },
  INVALIDATED: { label: 'Mất hiệu lực', tone: 'neutral' },
};

function formatDeadline(iso: string): string {
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed)
    ? new Date(parsed).toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      })
    : '—';
}

export default function SwapsView({
  buildingId,
  buildingName,
  accountId,
  entries,
  refreshKey,
  onRefresh,
  onSessionExpired,
}: SwapsViewProps) {
  const [tab, setTab] = useState<SwapTab>('incoming');
  const [incoming, setIncoming] = useState<Swap[]>([]);
  const [outgoing, setOutgoing] = useState<Swap[]>([]);
  const [history, setHistory] = useState<Swap[]>([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState('');
  const [busy, setBusy] = useState(true);
  const [blocked, setBlocked] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const mounted = useRef(false);
  const inFlight = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const silentRequest = useRef(false);
  const poll = useRef<() => Promise<void>>(async () => {});
  const refresh = useRef<() => Promise<void>>(async () => {});
  const previousRefreshKey = useRef(refreshKey);
  const schedulePoll = useRef<() => void>(() => {});
  const callbacks = useRef({ onRefresh, onSessionExpired });

  useEffect(() => {
    callbacks.current = { onRefresh, onSessionExpired };
  }, [onRefresh, onSessionExpired]);

  async function loadAll(signal: AbortSignal, targetTab: SwapTab, targetPage: number) {
    const root = `/api/buildings/${buildingId}/swaps`;
    const [pendingRes, outgoingRes, historyRes] = await Promise.all([
      fetch(`${root}/pending?page=${targetTab === 'incoming' ? targetPage : 0}&size=${PAGE_SIZE}`, { cache: 'no-store', signal }),
      fetch(`${root}/outgoing`, { cache: 'no-store', signal }),
      fetch(`${root}?page=${targetTab === 'history' ? targetPage : 0}&size=${PAGE_SIZE}`, { cache: 'no-store', signal }),
    ]);

    if (!mounted.current || signal.aborted) return;
    if ([pendingRes, outgoingRes, historyRes].some((r) => r.status === 401)) {
      setBlocked(true);
      callbacks.current.onSessionExpired();
      throw new Error('Phiên đăng nhập đã hết hạn.');
    }
    if (!pendingRes.ok || !outgoingRes.ok || !historyRes.ok) {
      throw new Error('Không tải được danh sách đổi lượt. Hãy tải lại.');
    }

    const [pendingData, sentData, historyData] = (await Promise.all([
      pendingRes.json(),
      outgoingRes.json(),
      historyRes.json(),
    ])) as [SwapPage, Swap[], SwapPage];

    if (!mounted.current || signal.aborted) return;

    const outgoingIds = new Set(sentData.map((s) => s.id));
    setOutgoing(sentData);
    setIncoming(pendingData.items.filter((s) => !outgoingIds.has(s.id)));
    setHistory(historyData.items);
    setHasNext(targetTab === 'incoming' ? pendingData.hasNext : targetTab === 'history' ? historyData.hasNext : false);
    setTab(targetTab);
    setPage(targetPage);
    setBlocked(false);
    setError('');
  }

  async function run(
    action?: 'create' | 'accept' | 'reject' | 'cancel',
    swapId?: string,
    targetTab = tab,
    targetPage = page,
    silent = false,
  ) {
    if (!mounted.current || (!action && document.hidden)) return;
    if (inFlight.current) {
      if (silent || !silentRequest.current) return;
      // A user action takes priority over a silent read, never over another mutation.
      pending.current?.abort();
    }
    inFlight.current = true;
    silentRequest.current = silent;
    if (!silent) {
      setBusy(true);
      setBlocked(true);
      setNotice('');
    }
    const controller = new AbortController();
    pending.current = controller;
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;

    const execute = async () => {
      if (action) {
        const res = await fetch(
          `/api/buildings/${buildingId}/swaps${action === 'create' ? '' : `/${swapId}/${action}`}`,
          {
            method: 'POST',
            cache: 'no-store',
            signal: controller.signal,
            ...(action === 'create'
              ? {
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ recipientEntryId: selectedTarget }),
                }
              : {}),
          },
        );
        if (!mounted.current || controller.signal.aborted) return;
        if (res.status === 401) {
          callbacks.current.onSessionExpired();
          return;
        }
        if (!res.ok) {
          throw new Error('Lời mời không còn hợp lệ hoặc bạn không có quyền thực hiện.');
        }
        await callbacks.current.onRefresh();
        if (!mounted.current || controller.signal.aborted) return;
        setSelectedTarget('');
        setNotice(
          action === 'create'
            ? 'Đã gửi lời mời đổi lượt (hiệu lực 10 phút).'
            : action === 'accept'
              ? 'Đã đồng ý đổi lượt.'
              : action === 'reject'
                ? 'Đã từ chối lời mời.'
                : 'Đã hủy lời mời đổi lượt.',
        );
      }
      await loadAll(controller.signal, targetTab, targetPage);
    };

    try {
      // Bound the entire operation, including JSON bodies and the parent's refresh.
      await Promise.race([
        execute(),
        new Promise<never>((_, reject) => {
          onAbort = () => reject(new Error(timedOut
            ? 'Yêu cầu quá thời gian. Hãy tải lại trạng thái trước khi thử lại.'
            : 'Yêu cầu đã bị hủy.'));
          controller.signal.addEventListener('abort', onAbort, { once: true });
          timeout = setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, REQUEST_TIMEOUT_MS);
        }),
      ]);
    } catch (err) {
      if (mounted.current && pending.current === controller && (timedOut || !controller.signal.aborted)) {
        // A failed background read leaves stale data; only a complete load may unlock actions.
        setBlocked(true);
        setError(err instanceof Error ? err.message : 'Chưa rõ kết quả. Hãy thử tải lại.');
      }
    } finally {
      clearTimeout(timeout);
      if (onAbort) controller.signal.removeEventListener('abort', onAbort);
      controller.abort();
      if (mounted.current && pending.current === controller) {
        pending.current = null;
        inFlight.current = false;
        silentRequest.current = false;
        setBusy(false);
        schedulePoll.current();
      }
    }
  }

  useEffect(() => {
    poll.current = () => run(undefined, undefined, tab, page, true);
    refresh.current = () => run();
  });

  useEffect(() => {
    mounted.current = true;
    inFlight.current = false;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      if (active && !document.hidden && !inFlight.current) {
        timer = setTimeout(() => void poll.current(), POLL_INTERVAL_MS);
      }
    };
    schedulePoll.current = schedule;
    const onVisibilityChange = () => {
      clearTimeout(timer);
      if (!document.hidden) void poll.current();
      else if (silentRequest.current) pending.current?.abort();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    void Promise.resolve().then(() => {
      if (!active) return;
      setSelectedTarget('');
      setTab('incoming');
      setPage(0);
      setIncoming([]);
      setOutgoing([]);
      setHistory([]);
      setHasNext(false);
      setBlocked(true);
      setBusy(true);
      setError('');
      setNotice('');
      void run(undefined, undefined, 'incoming', 0);
    });
    return () => {
      active = false;
      mounted.current = false;
      clearTimeout(timer);
      pending.current?.abort();
      pending.current = null;
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingId, accountId]);

  useEffect(() => {
    if (previousRefreshKey.current !== refreshKey) {
      previousRefreshKey.current = refreshKey;
      void refresh.current();
    }
  }, [refreshKey]);

  const sorted = [...entries].sort((a, b) => a.position - b.position);
  const ownIndex = sorted.findIndex((e) => e.accountId === accountId);
  const targets = ownIndex < 0 ? [] : sorted.slice(ownIndex + 1);
  const hasOutgoing = outgoing.some((s) => s.status === 'PENDING');
  const disabled = busy || blocked;
  const names = new Map(entries.map((e) => [e.accountId, e.displayName]));

  const currentItems = tab === 'incoming' ? incoming : tab === 'outgoing' ? outgoing : history;
  const showPagination = tab !== 'outgoing' && (page > 0 || hasNext);

  return (
    <div className="view-stack">
      <header className="page-header">
        <div>
          <p className="page-kicker">{buildingName}</p>
          <h1 className="page-title">Đổi lượt trong hàng</h1>
        </div>
      </header>

      <section className="surface-card" aria-label="Gửi lời mời đổi lượt">
        <h2 className="section-title-sm">
          <SwapIcon size={17} /> Gửi đề nghị đổi vị trí
        </h2>
        <p className="muted-note">
          Chỉ đổi đúng hai vị trí đang chờ, không thay đổi trạng thái Sẵn sàng. Lời mời có hiệu lực 10 phút và sẽ tự hủy nếu một trong hai người nhận máy hoặc rời hàng.
        </p>

        {ownIndex < 0 ? (
          <p className="muted-note" style={{ margin: 0 }}>
            Bạn cần đang xếp hàng chờ (WAITING) để gửi hoặc nhận yêu cầu đổi lượt.
          </p>
        ) : targets.length === 0 ? (
          <p className="muted-note" style={{ margin: 0 }}>
            Hiện chưa có cư dân nào xếp phía sau bạn để đề nghị đổi lượt.
          </p>
        ) : (
          <div className="swap-compose-row">
            <label className="field" style={{ flex: 1, marginBottom: 0 }}>
              <span>Chọn người phía sau (bạn đang ở vị trí #{ownIndex + 1})</span>
              <select
                value={selectedTarget}
                disabled={disabled || hasOutgoing}
                onChange={(e) => setSelectedTarget(e.target.value)}
              >
                <option value="">Chọn cư dân muốn đổi vị trí</option>
                {targets.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.displayName} · vị trí #{sorted.indexOf(entry) + 1}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-primary"
              disabled={disabled || hasOutgoing || !targets.some((e) => e.id === selectedTarget)}
              onClick={() => void run('create')}
            >
              Gửi lời mời
            </button>
          </div>
        )}

        {hasOutgoing && (
          <p className="muted-note" style={{ marginTop: 10, marginBottom: 0 }}>
            Bạn đang có một lời mời chờ phản hồi. Hãy hủy lời mời hiện tại trước khi gửi lời mời mới.
          </p>
        )}
      </section>

      {error && (
        <div className="alert alert-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="btn btn-outline"
            disabled={busy}
            onClick={() => void run()}
          >
            Tải lại danh sách đổi lượt
          </button>
        </div>
      )}
      {notice && <p className="alert alert-ok" role="status">{notice}</p>}

      <section className="surface-card" aria-label="Danh sách yêu cầu đổi lượt">
        <div className="segmented-tabs" role="tablist" aria-label="Phân loại đổi lượt">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'incoming'}
            className={tab === 'incoming' ? 'seg-tab active' : 'seg-tab'}
            disabled={disabled}
            onClick={() => void run(undefined, undefined, 'incoming', 0)}
          >
            Nhận được ({incoming.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'outgoing'}
            className={tab === 'outgoing' ? 'seg-tab active' : 'seg-tab'}
            disabled={disabled}
            onClick={() => void run(undefined, undefined, 'outgoing', 0)}
          >
            Đã gửi ({outgoing.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'history'}
            className={tab === 'history' ? 'seg-tab active' : 'seg-tab'}
            disabled={disabled}
            onClick={() => void run(undefined, undefined, 'history', 0)}
          >
            Lịch sử
          </button>
        </div>

        {currentItems.length === 0 ? (
          <EmptyState
            compact
            icon={<SwapIcon size={22} />}
            title={
              tab === 'incoming'
                ? 'Chưa có lời mời nhận được'
                : tab === 'outgoing'
                  ? 'Bạn chưa gửi lời mời nào'
                  : 'Chưa có lịch sử đổi lượt'
            }
            description="Các lời mời đổi lượt giữa cư dân sẽ hiển thị tại đây."
          />
        ) : (
          <ul className="swap-card-list">
            {currentItems.map((swap) => {
              const statusMeta = STATUS_UI[swap.status] ?? { label: swap.status, tone: 'neutral' as const };
              const isSender = swap.senderId === accountId;
              const senderName = names.get(swap.senderId) ?? 'Cư dân gửi';
              const recipientName = names.get(swap.recipientId) ?? 'Cư dân nhận';

              return (
                <li key={swap.id} className="swap-card-row">
                  <div className="swap-card-info">
                    <div className="swap-card-title">
                      <strong>{senderName}</strong>
                      <span aria-hidden="true">→</span>
                      <strong>{recipientName}</strong>
                      <StatusBadge tone={statusMeta.tone}>{statusMeta.label}</StatusBadge>
                    </div>
                    <span className="muted-note" style={{ margin: 0 }}>
                      Hạn hiệu lực: {formatDeadline(swap.expiresAt)}
                    </span>
                  </div>

                  {swap.status === 'PENDING' && (
                    <div className="action-row">
                      {isSender ? (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={disabled}
                          onClick={() => void run('cancel', swap.id)}
                        >
                          Hủy lời mời
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={disabled}
                            onClick={() => void run('accept', swap.id)}
                          >
                            Đồng ý đổi
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={disabled}
                            onClick={() => void run('reject', swap.id)}
                          >
                            Từ chối
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {showPagination && (
          <div className="pagination-bar">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={disabled || page === 0}
              onClick={() => void run(undefined, undefined, tab, page - 1)}
            >
              Trang trước
            </button>
            <span>Trang {page + 1}</span>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={disabled || !hasNext}
              onClick={() => void run(undefined, undefined, tab, page + 1)}
            >
              Trang sau
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
