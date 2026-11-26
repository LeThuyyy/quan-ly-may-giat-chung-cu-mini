// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MachineHoldCard, { type MachineHoldCardProps, type MachineHoldView } from '../MachineHoldCard';

const start = new Date('2026-11-21T10:00:00Z');
const hold: MachineHoldView = {
  id: '22222222-2222-4222-8222-222222222222',
  machineId: '33333333-3333-4333-8333-333333333333',
  accountId: 'resident-a',
  queueEntryId: 'queue-a',
  expiresAt: '2026-11-21T10:08:00Z',
};
const fetchMock = vi.fn<typeof fetch>();

function props(overrides: Partial<MachineHoldCardProps> = {}): MachineHoldCardProps {
  return {
    buildingId: '11111111-1111-4111-8111-111111111111',
    accountId: 'resident-a',
    hold,
    machineLabel: 'Máy 2',
    onRefresh: vi.fn().mockResolvedValue(undefined),
    onSessionExpired: vi.fn(),
    ...overrides,
  };
}

async function tick(milliseconds = 250) {
  await act(async () => { vi.advanceTimersByTime(milliseconds); });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(start);
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('MachineHoldCard', () => {
  it('hides missing holds and holds owned by someone else', () => {
    const view = render(<MachineHoldCard {...props({ hold: null })} />);
    expect(screen.queryByRole('region')).toBeNull();
    view.rerender(<MachineHoldCard {...props({ accountId: 'resident-b' })} />);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('renders the machine and countdown from the supplied deadline', async () => {
    render(<MachineHoldCard {...props()} />);
    expect(screen.getByRole('heading').textContent).toContain('Máy 2');
    expect(screen.getByRole('timer').textContent).toBe('--:--');
    await tick();
    expect(screen.getByRole('timer').textContent).toBe('08:00');
    await tick(1000);
    expect(screen.getByRole('timer').textContent).toBe('07:59');
    expect(screen.getByText(/Đóng trang có thể/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('confirms the physical check once without starting a wash', async () => {
    const config = props();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    render(<MachineHoldCard {...config} />);
    await tick();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tôi đã kiểm tra máy tại chỗ' })); });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/buildings/${config.buildingId}/holds/${hold.id}/confirm-check`,
      expect.objectContaining({ method: 'POST', cache: 'no-store' }),
    );
    expect(config.onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Đã ghi nhận kiểm tra' }).getAttribute('disabled')).not.toBeNull();
    expect(screen.getByText(/Đây chưa phải thao tác bắt đầu giặt/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('blocks duplicate clicks while yielding and disables further actions after success', async () => {
    let complete!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const config = props();
    render(<MachineHoldCard {...config} />);
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'Nhường lượt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đang nhường…' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { complete(new Response(null, { status: 200 })); });
    expect(config.onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Nhường lượt' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Tôi đã kiểm tra máy tại chỗ' }).hasAttribute('disabled')).toBe(true);
  });

  it('at the exact deadline disables actions and asks for a server refresh only once', async () => {
    const config = props();
    render(<MachineHoldCard {...config} />);
    await tick();
    vi.setSystemTime(new Date(hold.expiresAt));
    await tick();
    expect(screen.getByRole('timer').textContent).toBe('00:00');
    expect(screen.getByRole('button', { name: 'Nhường lượt' }).hasAttribute('disabled')).toBe(true);
    expect(config.onRefresh).toHaveBeenCalledTimes(1);
    await tick(2000);
    expect(config.onRefresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks the wall clock on click even if a background timer has not ticked', async () => {
    render(<MachineHoldCard {...props()} />);
    await tick();
    vi.setSystemTime(new Date(hold.expiresAt));
    fireEvent.click(screen.getByRole('button', { name: 'Nhường lượt' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('handles 401 by notifying the parent and keeping mutation actions disabled', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const config = props();
    render(<MachineHoldCard {...config} />);
    await tick();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Nhường lượt' })); });
    expect(config.onSessionExpired).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toContain('Phiên đăng nhập đã hết hạn');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tải lại trạng thái' })); });
    expect(screen.getByRole('button', { name: 'Nhường lượt' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows a conflict and reloads the server snapshot without claiming success', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Lượt giữ đã kết thúc.' }), { status: 409 }));
    const config = props();
    render(<MachineHoldCard {...config} />);
    await tick();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Nhường lượt' })); });
    expect(screen.getByRole('alert').textContent).toBe('Lượt giữ đã kết thúc.');
    expect(config.onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Đã nhường lượt/)).toBeNull();
  });

  it('treats network failures as an unknown outcome until manually refreshed', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const config = props();
    render(<MachineHoldCard {...config} />);
    await tick();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Nhường lượt' })); });
    expect(screen.getByRole('alert').textContent).toContain('chưa rõ thao tác');
    expect(screen.getByRole('button', { name: 'Nhường lượt' }).hasAttribute('disabled')).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tải lại trạng thái' })); });
    expect(config.onRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not retry a mutation after a non-JSON proxy error until refreshed', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
    const config = props();
    render(<MachineHoldCard {...config} />);
    await tick();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Nhường lượt' })); });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nhường lượt' }).hasAttribute('disabled')).toBe(true);
    expect(config.onRefresh).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tải lại trạng thái' })); });
    expect(config.onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Nhường lượt' }).hasAttribute('disabled')).toBe(false);
  });

  it('keeps a successful yield closed when the following refresh fails', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const config = props({ onRefresh: vi.fn().mockRejectedValue(new Error('offline')) });
    render(<MachineHoldCard {...config} />);
    await tick();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Nhường lượt' })); });
    expect(screen.getByText(/Đã nhường lượt/)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Không tải lại được');
    expect(screen.getByRole('button', { name: 'Nhường lượt' }).hasAttribute('disabled')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not let an old in-flight response refresh another building', async () => {
    let complete!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const first = props();
    const view = render(<MachineHoldCard {...first} />);
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'Nhường lượt' }));
    const second = props({ buildingId: 'other-building', hold: { ...hold, id: 'new-hold' }, machineLabel: 'Máy khác' });
    view.rerender(<MachineHoldCard {...second} />);
    await act(async () => { complete(new Response(null, { status: 200 })); });
    expect(first.onRefresh).not.toHaveBeenCalled();
    expect(second.onRefresh).not.toHaveBeenCalled();
    expect(screen.queryByText(/Đã nhường lượt/)).toBeNull();
    expect(screen.getByRole('heading').textContent).toContain('Máy khác');
  });

  it('fails closed for a malformed deadline and offers refresh', async () => {
    const config = props({ hold: { ...hold, expiresAt: 'not-a-date' } });
    render(<MachineHoldCard {...config} />);
    await tick();
    expect(screen.getByText(/Không đọc được hạn/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nhường lượt' }).hasAttribute('disabled')).toBe(true);
    expect(config.onRefresh).toHaveBeenCalledTimes(1);
  });

  it('compensates for client clock skew when serverNow is provided', async () => {
    // Client device clock is 5 minutes ahead of server (past the 10:08 deadline locally,
    // while serverNow is still 10:05:00Z, leaving 3 minutes of valid hold).
    vi.setSystemTime(new Date('2026-11-21T10:10:00Z'));
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const config = props({ serverNow: '2026-11-21T10:05:00Z' });
    render(<MachineHoldCard {...config} />);
    await tick();
    expect(screen.getByRole('timer').textContent).toBe('03:00');
    expect(screen.getByRole('button', { name: 'Tôi đã kiểm tra máy tại chỗ' }).hasAttribute('disabled')).toBe(false);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tôi đã kiểm tra máy tại chỗ' })); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
