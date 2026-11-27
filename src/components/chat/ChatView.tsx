'use client';

import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/components/ChatPanel';
import { ChatIcon, SendIcon } from '@/components/Icons';
import DropdownMenu from '@/components/ui/DropdownMenu';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';

interface Page<T> {
  items: T[];
  page: number;
  size: number;
  hasNext: boolean;
}

interface ChatViewProps {
  buildingId: string;
  buildingName: string;
  accountId: string;
  isManager: boolean;
  onSessionExpired: () => void;
}

type ModerationAction =
  | { type: 'report'; message: ChatMessage }
  | { type: 'hide'; message: ChatMessage };

const REASON_OPTIONS = [
  { value: 'SPAM', label: 'Tin rác / Quảng cáo (Spam)' },
  { value: 'ABUSE', label: 'Ngôn từ không phù hợp / Làm phiền' },
  { value: 'OTHER', label: 'Lý do khác' },
] as const;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getDateKey(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function formatDateHeading(iso: string): string {
  const key = getDateKey(iso);
  const today = getDateKey(new Date().toISOString());
  const yesterday = getDateKey(new Date(Date.now() - 86400000).toISOString());
  if (key === today) return 'Hôm nay';
  if (key === yesterday) return 'Hôm qua';
  return key;
}

function formatTimeOnly(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleTimeString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ChatView({
  buildingId,
  buildingName,
  accountId,
  isManager,
  onSessionExpired,
}: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [draft, setDraft] = useState('');
  const [blocked, setBlocked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialogAction, setDialogAction] = useState<ModerationAction | null>(null);
  const [reason, setReason] = useState<'SPAM' | 'ABUSE' | 'OTHER'>('SPAM');
  const [showJumpBottom, setShowJumpBottom] = useState(false);

  const mounted = useRef(false);
  const inFlight = useRef(false);
  const silentFailures = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const requestId = useRef<string | null>(null);
  const composing = useRef(false);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldStickBottom = useRef(true);
  const poll = useRef<() => Promise<void>>(async () => {});
  const expired = useRef(onSessionExpired);

  useEffect(() => {
    expired.current = onSessionExpired;
  }, [onSessionExpired]);

  const base = `/api/buildings/${buildingId}/chat`;

  async function checked(path: string, signal: AbortSignal, init?: RequestInit) {
    const response = await fetch(path, { ...init, cache: 'no-store', signal });
    if (!mounted.current || signal.aborted) throw new Error('Phạm vi đã thay đổi.');
    if (response.status === 401) expired.current();
    if (!response.ok) {
      throw new Error(
        response.status === 403
          ? 'Bạn không có quyền truy cập mục trò chuyện.'
          : response.status === 429
            ? 'Vui lòng chờ 5 giây trước khi gửi tin nhắn tiếp theo.'
            : 'Không thể hoàn tất thao tác. Hãy tải lại.',
      );
    }
    return response.json();
  }

  async function load(targetPage: number, signal: AbortSignal) {
    const result: Page<ChatMessage> = await checked(
      `${base}/messages?page=${targetPage}&size=30`,
      signal,
    );
    if (!mounted.current || signal.aborted) return;
    silentFailures.current = 0;
    setMessages((prev) => {
      if (
        prev.length === result.items.length &&
        prev.every((m, idx) => m.id === result.items[idx]?.id && m.hiddenAt === result.items[idx]?.hiddenAt)
      ) {
        return prev;
      }
      return result.items;
    });
    setHasNext(result.hasNext);
    setPage(targetPage);
    setBlocked(false);
    setError('');
  }

  async function run(
    action?: { path: string; payload: object; successText?: string },
    targetPage = page,
    options?: { silent?: boolean },
  ) {
    if (!mounted.current || inFlight.current) return;
    if (!action && document.hidden) return;
    inFlight.current = true;
    if (!options?.silent) setBusy(true);
    if (action) {
      setBlocked(true);
      setMutating(true);
      setNotice('');
    }
    const scope = new AbortController();
    controller.current = scope;
    try {
      if (action) {
        await checked(action.path, scope.signal, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action.payload),
        });
        if (mounted.current && !scope.signal.aborted) {
          if (action.path === `${base}/messages`) {
            setDraft('');
            requestId.current = null;
            shouldStickBottom.current = true;
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
          }
          if (action.successText) setNotice(action.successText);
        }
      }
      await load(targetPage, scope.signal);
    } catch (cause) {
      if (mounted.current && !scope.signal.aborted) {
        if (options?.silent) {
          silentFailures.current += 1;
          if (silentFailures.current < 2) return;
        }
        setBlocked(true);
        setError(cause instanceof Error ? cause.message : 'Không thể tải tin nhắn.');
      }
    } finally {
      if (mounted.current && controller.current === scope) {
        inFlight.current = false;
        if (!options?.silent) setBusy(false);
        setMutating(false);
      }
    }
  }

  useEffect(() => {
    poll.current = () => run(undefined, page, { silent: true });
  });

  useEffect(() => {
    mounted.current = true;
    shouldStickBottom.current = true;
    void Promise.resolve().then(() => run(undefined, 0));
    let active = true;
    let timer: number;
    const tick = async () => {
      if (document.visibilityState === 'visible') await poll.current();
      if (active) timer = window.setTimeout(() => void tick(), 8000);
    };
    timer = window.setTimeout(() => void tick(), 8000);

    function onVisibility() {
      if (document.hidden) {
        controller.current?.abort();
      } else {
        void run(undefined, page, { silent: true });
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      window.clearTimeout(timer);
      mounted.current = false;
      controller.current?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingId]);

  const chronological = [...messages].reverse();

  useEffect(() => {
    const el = timelineRef.current;
    if (!el || !shouldStickBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [chronological.length, page]);

  const handleScroll = () => {
    const el = timelineRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldStickBottom.current = distance < 72;
    setShowJumpBottom(distance > 180);
  };

  const jumpToLatest = () => {
    const el = timelineRef.current;
    if (!el) return;
    shouldStickBottom.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setShowJumpBottom(false);
  };

  const disabled = busy || blocked;

  function send() {
    if (disabled || !draft.trim() || draft.trim().length > 1000) return;
    requestId.current ??= crypto.randomUUID();
    void run(
      {
        path: `${base}/messages`,
        payload: { clientRequestId: requestId.current, body: draft.trim() },
      },
      0,
    );
  }

  function handleComposerKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return;
    if (composing.current || e.nativeEvent.isComposing) return;
    e.preventDefault();
    send();
  }

  async function confirmModeration() {
    if (!dialogAction) return;
    const target = dialogAction;
    setDialogAction(null);
    if (target.type === 'report') {
      await run({
        path: `${base}/messages/${target.message.id}/report`,
        payload: { reasonCode: reason },
        successText: 'Đã gửi báo cáo tin nhắn tới quản lý tòa nhà.',
      });
    } else {
      await run({
        path: `${base}/messages/${target.message.id}/hide`,
        payload: { reasonCode: reason },
        successText: 'Đã ẩn tin nhắn.',
      });
    }
  }

  return (
    <div className="view-stack chat-view-wrap">
      <section className="chat-shell" aria-label="Trò chuyện tòa nhà">
        <header className="chat-shell-header">
          <div>
            <h1 className="chat-shell-title">
              <ChatIcon size={19} /> Trò chuyện · {buildingName}
            </h1>
            <p className="chat-shell-sub">
              Tin nhắn được lưu 30 ngày · Báo cáo không tự động ẩn tin nhắn
            </p>
          </div>
          {(hasNext || page > 0) && (
            <div className="action-row">
              {hasNext && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={busy}
                  onClick={() => {
                    shouldStickBottom.current = false;
                    void run(undefined, page + 1);
                  }}
                >
                  Tin cũ hơn
                </button>
              )}
              {page > 0 && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={busy}
                  onClick={() => {
                    shouldStickBottom.current = true;
                    void run(undefined, page - 1);
                  }}
                >
                  Mới hơn
                </button>
              )}
            </div>
          )}
        </header>

        {error && <p className="alert alert-error chat-inline-alert" role="alert">{error}</p>}
        {notice && <p className="alert alert-ok chat-inline-alert" role="status">{notice}</p>}

        <div className="chat-timeline-wrap">
          <div
            ref={timelineRef}
            className="chat-timeline"
            onScroll={handleScroll}
          >
            {chronological.length === 0 ? (
              <EmptyState
                compact
                icon={<ChatIcon size={24} />}
                title="Chưa có tin nhắn nào"
                description="Hãy gửi lời chào hoặc trao đổi lịch giặt cùng cư dân trong tòa."
              />
            ) : (
              chronological.map((msg, idx) => {
                const prev = idx > 0 ? chronological[idx - 1] : null;
                const dateChanged = !prev || getDateKey(prev.sentAt) !== getDateKey(msg.sentAt);
                const sameAuthorGroup = !dateChanged && prev?.authorId === msg.authorId;
                const isOwn = msg.authorId === accountId;
                const isHidden = Boolean(msg.hiddenAt);

                const menuItems = [];
                if (!isHidden && !isOwn) {
                  menuItems.push({
                    label: 'Báo cáo tin nhắn',
                    onClick: () => {
                      setReason('SPAM');
                      setDialogAction({ type: 'report', message: msg });
                    },
                  });
                }
                if (!isHidden && isManager) {
                  menuItems.push({
                    label: 'Ẩn tin nhắn',
                    danger: true,
                    onClick: () => {
                      setReason('SPAM');
                      setDialogAction({ type: 'hide', message: msg });
                    },
                  });
                }

                return (
                  <div key={msg.id} className="chat-entry-group">
                    {dateChanged && (
                      <div className="chat-date-sep" role="separator">
                        <span>{formatDateHeading(msg.sentAt)}</span>
                      </div>
                    )}

                    <div className={isOwn ? 'chat-row own' : 'chat-row other'}>
                      {!isOwn && (
                        <span
                          className={sameAuthorGroup ? 'chat-avatar-spacer' : 'avatar-circle avatar-sm'}
                          aria-hidden="true"
                        >
                          {!sameAuthorGroup ? getInitials(msg.displayName) : null}
                        </span>
                      )}

                      <div className={isOwn ? 'chat-bubble-col own' : 'chat-bubble-col other'}>
                        {!sameAuthorGroup && !isOwn && (
                          <span className="chat-sender-name">{msg.displayName}</span>
                        )}

                        <div className="chat-bubble-line">
                          <div
                            className={
                              isHidden
                                ? 'chat-bubble hidden'
                                : isOwn
                                  ? 'chat-bubble own'
                                  : 'chat-bubble other'
                            }
                          >
                            <p className="chat-bubble-text">
                              {isHidden ? 'Tin nhắn đã bị quản lý ẩn.' : msg.body}
                            </p>
                            <time className="chat-bubble-time" dateTime={msg.sentAt}>
                              {formatTimeOnly(msg.sentAt)}
                            </time>
                          </div>

                          {menuItems.length > 0 && (
                            <DropdownMenu
                              label={`Tùy chọn tin nhắn của ${msg.displayName}`}
                              items={menuItems}
                              disabled={disabled}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {showJumpBottom && (
            <button
              type="button"
              className="btn btn-primary btn-sm chat-jump-btn"
              onClick={jumpToLatest}
            >
              Về tin nhắn mới nhất
            </button>
          )}
        </div>

        <div className="chat-composer-bar">
          <label htmlFor="chat-composer-input" className="visually-hidden">
            Nội dung tin nhắn
          </label>
          <textarea
            id="chat-composer-input"
            ref={textareaRef}
            rows={1}
            maxLength={1000}
            value={draft}
            disabled={mutating || blocked}
            placeholder="Nhập tin nhắn..."
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
            onKeyDown={handleComposerKeyDown}
            onChange={(e) => {
              setDraft(e.target.value);
              requestId.current = null;
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
          />
          <button
            type="button"
            className="btn btn-primary chat-send-btn"
            disabled={disabled || !draft.trim()}
            onClick={send}
            aria-label="Gửi tin nhắn"
          >
            <SendIcon size={16} />
            <span className="chat-send-label">Gửi</span>
          </button>
        </div>
      </section>

      <Modal
        open={Boolean(dialogAction)}
        onClose={() => setDialogAction(null)}
        title={dialogAction?.type === 'hide' ? 'Ẩn tin nhắn này?' : 'Báo cáo tin nhắn'}
        description={
          dialogAction?.type === 'hide'
            ? `Tin nhắn của ${dialogAction.message.displayName} sẽ bị ẩn với toàn bộ cư dân và được ghi vào nhật ký kiểm duyệt.`
            : `Báo cáo tin nhắn của ${dialogAction?.message.displayName ?? ''} tới quản lý tòa nhà.`
        }
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setDialogAction(null)}>
              Hủy
            </button>
            <button
              type="button"
              className={dialogAction?.type === 'hide' ? 'btn btn-danger-solid' : 'btn btn-primary'}
              onClick={() => void confirmModeration()}
              disabled={disabled}
            >
              {dialogAction?.type === 'hide' ? 'Xác nhận ẩn' : 'Gửi báo cáo'}
            </button>
          </>
        }
      >
        <label className="field">
          <span>Chọn lý do</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as 'SPAM' | 'ABUSE' | 'OTHER')}
          >
            {REASON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </Modal>
    </div>
  );
}
