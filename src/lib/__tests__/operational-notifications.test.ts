import { describe, expect, it } from 'vitest';
import { collectOperationalNotifications, type NotificationInput } from '../operational-notifications';
import type { OperationalSnapshot } from '@/types/laundry';
function input(overrides: Partial<OperationalSnapshot> = {}): NotificationInput {
  return { accountId: 'a', pendingMemberIds: null, issueIds: null, snapshot: {
    building: { id: 'building', name: 'Tòa', machines: [{ id: 'machine', label: 'Máy 1', status: 'AVAILABLE' }], queue: [] },
    membership: { id: 'building', name: 'Tòa', role: 'RESIDENT', status: 'APPROVED' },
    queueStatus: { state: 'NONE', queueEntryId: null, ready: null, holdId: null, machineId: null, expiresAt: null, serverNow: '2026-11-28T00:00:00Z' },
    holds: [], myCycles: [], previousCycle: null, serverNow: '2026-11-28T00:00:00Z',
    notifications: { incomingSwaps: [], outgoingResponses: [], latestHold: null }, ...overrides,
  } };
}
function held(now = '2026-11-28T00:00:00Z') {
  const value = input({ serverNow: now });
  value.snapshot.queueStatus.state = 'HELD'; value.snapshot.queueStatus.holdId = 'hold';
  value.snapshot.holds = [{ id: 'hold', accountId: 'a', queueEntryId: 'entry', machineId: 'machine', expiresAt: '2026-11-28T00:08:00Z' }];
  return value;
}
describe('server-backed operational notifications', () => {
  it('announces an active assigned hold once and does not repeat after refresh', () => {
    const first = collectOperationalNotifications(null, held());
    expect(first.notices.map(n => n.message).join(' ')).toContain('Máy 1');
    expect(collectOperationalNotifications(first.cursor, held()).notices).toEqual([]);
  });
  it('warns at the server two-minute boundary rather than using the device clock', () => {
    const initial = collectOperationalNotifications(null, held());
    const soon = collectOperationalNotifications(initial.cursor, held('2026-11-28T00:06:00Z'));
    expect(soon.notices).toHaveLength(1); expect(soon.notices[0].message).toContain('2 phút');
    expect(collectOperationalNotifications(soon.cursor, held('2026-11-28T00:06:05Z')).notices).toEqual([]);
  });
  it('does not fabricate expiry from a zero countdown or missing hold', () => {
    const initial = collectOperationalNotifications(null, held());
    expect(collectOperationalNotifications(initial.cursor, held('2026-11-28T00:08:00Z')).notices).toEqual([]);
    const ended = input({ serverNow: '2026-11-28T00:08:05Z' });
    ended.snapshot.notifications!.latestHold = { id: 'hold', status: 'YIELDED', expiresAt: '2026-11-28T00:08:00Z' };
    expect(collectOperationalNotifications(initial.cursor, ended).notices).toEqual([]);
    ended.snapshot.notifications!.latestHold.status = 'EXPIRED';
    expect(collectOperationalNotifications(initial.cursor, ended).notices[0].message).toContain('Máy chủ xác nhận');
  });
  it('baselines historical swap responses and expired holds instead of replaying them on login', () => {
    const value = input(); value.snapshot.notifications = {
      incomingSwaps: [{ id: 'old-in', status: 'PENDING' }], outgoingResponses: [{ id: 'old-out', status: 'ACCEPTED' }],
      latestHold: { id: 'old-hold', status: 'EXPIRED', expiresAt: '2026-11-27T00:00:00Z' },
    };
    const first = collectOperationalNotifications(null, value); expect(first.notices).toEqual([]);
    value.snapshot.notifications.incomingSwaps.push({ id: 'new-in', status: 'PENDING' });
    value.snapshot.notifications.outgoingResponses.push({ id: 'new-out', status: 'REJECTED' });
    const changed = collectOperationalNotifications(first.cursor, value);
    expect(changed.notices.map(n => n.view)).toEqual(['swaps', 'swaps']);
    expect(collectOperationalNotifications(changed.cursor, value).notices).toEqual([]);
  });
  it('resets scopes and ignores out-of-order snapshots', () => {
    const previous = collectOperationalNotifications(null, held()).cursor;
    const older = held('2026-11-27T23:59:00Z'); expect(collectOperationalNotifications(previous, older).notices).toEqual([]);
    const changed = held(); changed.accountId = 'other';
    expect(collectOperationalNotifications(previous, changed).notices).toEqual([]);
  });
  it('reports actual outstanding manager work initially and only new IDs afterwards', () => {
    const value = input(); value.snapshot.membership.role = 'MANAGER'; value.pendingMemberIds = ['member']; value.issueIds = ['issue'];
    const first = collectOperationalNotifications(null, value); expect(first.notices).toHaveLength(1);
    expect(first.notices[0].message).toContain('1 yêu cầu');
    value.pendingMemberIds.push('new-member'); value.issueIds.push('new-issue');
    const next = collectOperationalNotifications(first.cursor, value); expect(next.notices).toHaveLength(2);
    value.snapshot.membership.role = 'RESIDENT'; expect(collectOperationalNotifications(next.cursor, value).notices).toEqual([]);
  });
});
