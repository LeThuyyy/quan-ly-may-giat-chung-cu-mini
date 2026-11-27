// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import OperationalNotifications from '../OperationalNotifications';
import type { NotificationInput } from '@/lib/operational-notifications';
function input(): NotificationInput { return { accountId: 'a', pendingMemberIds: null, issueIds: null, snapshot: {
  building: { id: 'b', name: 'Tòa', machines: [{ id: 'm', label: 'Máy 1', status: 'AVAILABLE' }], queue: [] },
  membership: { id: 'b', name: 'Tòa', role: 'RESIDENT', status: 'APPROVED' },
  queueStatus: { state: 'HELD', queueEntryId: 'entry', ready: null, holdId: 'hold', machineId: 'm', expiresAt: '2026-11-28T00:08:00Z', serverNow: '2026-11-28T00:00:00Z' },
  holds: [{ id: 'hold', machineId: 'm', accountId: 'a', queueEntryId: 'entry', expiresAt: '2026-11-28T00:08:00Z' }],
  myCycles: [], previousCycle: null, serverNow: '2026-11-28T00:00:00Z',
  notifications: { incomingSwaps: [], outgoingResponses: [], latestHold: { id: 'hold', status: 'ACTIVE', expiresAt: '2026-11-28T00:08:00Z' } },
} }; }
afterEach(cleanup);
it('announces actual assignment, navigates, and does not resurrect dismissed notices on polling', async () => {
  const value = input(), navigate = vi.fn();const view = render(<OperationalNotifications input={value} onNavigate={navigate} />);
  await screen.findByText(/Bạn đã được giao Máy 1/);
  fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết' }));expect(navigate).toHaveBeenCalledWith('overview');
  fireEvent.click(screen.getByRole('button', { name: /Đóng:/ }));
  view.rerender(<OperationalNotifications input={{ ...value, snapshot: { ...value.snapshot, serverNow: '2026-11-28T00:00:05Z' } }} onNavigate={navigate} />);
  await act(async () => { await Promise.resolve(); });expect(screen.queryByText(/Bạn đã được giao/)).toBeNull();
});
it('clears operational messages when account/building scope disappears', async () => {
  const view = render(<OperationalNotifications input={input()} onNavigate={vi.fn()} />);await screen.findByText(/Bạn đã được giao/);
  view.rerender(<OperationalNotifications input={null} onNavigate={vi.fn()} />);
  expect(screen.queryByRole('complementary')).toBeNull();
});
it('does not produce an expiry alert from the countdown alone', async () => {
  const value = input();const view = render(<OperationalNotifications input={value} onNavigate={vi.fn()} />);await screen.findByText(/Bạn đã được giao/);
  view.rerender(<OperationalNotifications input={{ ...value, snapshot: { ...value.snapshot, serverNow: '2026-11-28T00:08:00Z' } }} onNavigate={vi.fn()} />);
  await waitFor(() => expect(screen.queryByText(/Máy chủ xác nhận/)).toBeNull());
});
