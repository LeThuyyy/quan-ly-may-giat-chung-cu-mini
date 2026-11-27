import type { AppView, OperationalSnapshot } from '@/types/laundry';

export interface OperationalNotification { id: string; message: string; view: AppView }
export interface NotificationInput {
  accountId: string;
  snapshot: OperationalSnapshot;
  pendingMemberIds: string[] | null;
  issueIds: string[] | null;
}
export interface NotificationCursor {
  scope: string;
  observedAt: number;
  seen: Set<string>;
  initialized: boolean;
  managerInitialized: boolean;
}
export function collectOperationalNotifications(previous: NotificationCursor | null, input: NotificationInput) {
  const scope = `${input.accountId}:${input.snapshot.building.id}`;
  const now = Date.parse(input.snapshot.serverNow);
  const state: NotificationCursor = previous?.scope === scope
    ? { ...previous, seen: new Set(previous.seen) }
    : { scope, observedAt: now, seen: new Set(), initialized: false, managerInitialized: false };
  const notices: OperationalNotification[] = [];
  if (!Number.isFinite(now) || (state.initialized && now < state.observedAt)) return { cursor: state, notices };
  const facts = input.snapshot.notifications;
  function event(id: string, message: string, view: AppView, announce: boolean) {
    if (state.seen.has(id)) return;
    state.seen.add(id);
    if (announce) notices.push({ id: `${scope}:${id}`, message, view });
  }
  const current = input.snapshot.holds.find(hold => hold.accountId === input.accountId
    && hold.id === input.snapshot.queueStatus.holdId && input.snapshot.queueStatus.state === 'HELD');
  if (current) {
    const remaining = Date.parse(current.expiresAt) - now;
    if (remaining > 0) {
      const label = input.snapshot.building.machines.find(machine => machine.id === current.machineId)?.label ?? 'máy giặt';
      event(`assigned:${current.id}`, `Bạn đã được giao ${label}. Hạn bắt đầu tính từ lúc giao máy.`, 'overview', true);
      if (remaining <= 120000) event(`soon:${current.id}`, 'Lượt giữ máy của bạn còn không quá 2 phút. Hãy kiểm tra hạn hiện tại.', 'overview', true);
    }
    // A client countdown is never proof that Java committed expiry.
  }
  if (facts) {
    for (const swap of facts.incomingSwaps) event(`swap-in:${swap.id}`, 'Bạn có lời mời đổi lượt mới.', 'swaps', state.initialized);
    for (const swap of facts.outgoingResponses) event(`swap-response:${swap.id}:${swap.status}`,
      swap.status === 'ACCEPTED' ? 'Lời mời đổi lượt của bạn đã được đồng ý.' : 'Lời mời đổi lượt của bạn đã bị từ chối.', 'swaps', state.initialized);
    const hold = facts.latestHold;
    if (hold?.status === 'EXPIRED') event(`expired:${hold.id}`, 'Máy chủ xác nhận lượt giữ máy đã hết hạn. Bạn có thể vào hàng lại.', 'overview', state.initialized);
  }
  const manager = input.snapshot.membership.role === 'MANAGER';
  if (manager && input.pendingMemberIds !== null && input.issueIds !== null) {
    const changed = state.managerInitialized;
    for (const id of input.pendingMemberIds) event(`member:${id}`, 'Có yêu cầu tham gia tòa mới cần duyệt.', 'admin-members', changed);
    for (const id of input.issueIds) event(`issue:${id}`, 'Có mẻ giặt cần quản lý kiểm tra và xử lý.', 'admin-moderation', changed);
    if (!changed && input.pendingMemberIds.length + input.issueIds.length > 0) notices.push({
      id: `${scope}:manager-initial`, message: `Có ${input.pendingMemberIds.length} yêu cầu tham gia và ${input.issueIds.length} sự cố đang chờ xử lý.`,
      view: input.issueIds.length ? 'admin-moderation' : 'admin-members',
    });
    state.managerInitialized = true;
  }
  if (!manager) state.managerInitialized = false;
  state.initialized = true; state.observedAt = now;
  return { cursor: state, notices };
}
