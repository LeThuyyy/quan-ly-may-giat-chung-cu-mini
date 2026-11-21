// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QueuePanel, { type QueuePanelProps } from '../QueuePanel';

const fetchMock = vi.fn<typeof fetch>();
function props(overrides: Partial<QueuePanelProps> = {}): QueuePanelProps {
  return {
    buildingId: 'building-a', accountId: 'me', entries: [], participation: 'NONE',
    onRefresh: vi.fn().mockResolvedValue(undefined), onSessionExpired: vi.fn(), ...overrides,
  };
}
const waiting = [
  { id: 'q3', accountId: 'me', displayName: 'Tôi', position: 42, ready: false },
  { id: 'q1', accountId: 'a', displayName: 'Người A', position: 2, ready: false },
  { id: 'q2', accountId: 'b', displayName: 'Người B', position: 9, ready: true },
];
async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })); });
}
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('QueuePanel', () => {
  it('sorts by order key but displays contiguous positions and ready people ahead', () => {
    render(<QueuePanel {...props({ participation: 'WAITING', entries: waiting })} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Người A — Chưa sẵn sàng', 'Người B — Sẵn sàng nhận máy', 'Tôi (Bạn) — Chưa sẵn sàng',
    ]);
    expect(rows[2].getAttribute('aria-current')).toBe('true');
    expect(screen.getByText(/Vị trí của bạn/).textContent).toContain('3. Người sẵn sàng phía trước: 1');
    expect(waiting[0].position).toBe(42);
  });

  it.each([['Vào hàng — Sẵn sàng', true], ['Vào hàng — Chưa sẵn sàng', false]] as const)(
    'joins with an explicit ready choice: %s', async (label, ready) => {
      fetchMock.mockResolvedValue(new Response(null, { status: 201 }));
      const config = props();
      render(<QueuePanel {...config} />);
      await click(label);
      expect(fetchMock).toHaveBeenCalledWith('/api/buildings/building-a/queue', expect.objectContaining({
        method: 'POST', body: JSON.stringify({ ready }), headers: { 'Content-Type': 'application/json' },
      }));
      expect(config.onRefresh).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: label }).hasAttribute('disabled')).toBe(true);
    });

  it.each([false, true])('toggles only readiness without editing queue locally: %s', async (ready) => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const config = props({ participation: 'WAITING', entries: [{ ...waiting[0], ready }] });
    render(<QueuePanel {...config} />);
    await click(ready ? 'Chuyển sang Chưa sẵn sàng' : 'Bật Sẵn sàng nhận máy');
    expect(fetchMock).toHaveBeenCalledWith('/api/buildings/building-a/queue/me', expect.objectContaining({
      method: 'PATCH', body: JSON.stringify({ ready: !ready }),
    }));
    expect(config.onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('listitem').textContent).toContain(ready ? 'Sẵn sàng nhận máy' : 'Chưa sẵn sàng');
  });

  it('leaves with DELETE without a body and blocks reuse of a stale snapshot', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    render(<QueuePanel {...props({ participation: 'WAITING', entries: waiting })} />);
    await click('Rời hàng');
    const init = fetchMock.mock.calls[0][1];
    expect(init?.method).toBe('DELETE');
    expect(init?.body).toBeUndefined();
    expect(screen.getByText(/Đã rời hàng/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rời hàng' }).hasAttribute('disabled')).toBe(true);
  });

  it.each(['HELD', 'WASHING', 'UNKNOWN'] as const)('does not infer eligibility to rejoin from an empty queue: %s', (participation) => {
    render(<QueuePanel {...props({ participation })} />);
    expect(screen.queryByRole('button', { name: 'Vào hàng — Sẵn sàng' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rời hàng' })).toBeNull();
  });

  it('fails closed when the queue and participation disagree', () => {
    const view = render(<QueuePanel {...props({ participation: 'WAITING' })} />);
    expect(screen.getByRole('status').textContent).toContain('Chưa xác minh');
    view.rerender(<QueuePanel {...props({ entries: waiting })} />);
    expect(screen.queryByRole('button', { name: 'Vào hàng — Sẵn sàng' })).toBeNull();
  });

  it('prevents double-click submissions', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<QueuePanel {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Vào hàng — Sẵn sàng' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vào hàng — Chưa sẵn sàng' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { finish(new Response(null, { status: 201 })); });
  });

  it('requires refresh after a conflict and resets on a new server participation', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Bạn đã nhận máy.' }), { status: 409 }));
    const config = props({ participation: 'WAITING', entries: waiting });
    const view = render(<QueuePanel {...config} />);
    await click('Rời hàng');
    expect(screen.getByRole('alert').textContent).toBe('Bạn đã nhận máy.');
    expect(screen.getByRole('button', { name: 'Rời hàng' }).hasAttribute('disabled')).toBe(true);
    view.rerender(<QueuePanel {...config} participation="HELD" entries={[]} />);
    expect(screen.queryByRole('button', { name: 'Rời hàng' })).toBeNull();
    expect(screen.getByText(/Bạn đã được giao máy/)).toBeTruthy();
  });

  it('keeps mutations disabled after 401 even if refresh resolves', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const config = props();
    render(<QueuePanel {...config} />);
    await click('Vào hàng — Sẵn sàng');
    expect(config.onSessionExpired).toHaveBeenCalledTimes(1);
    await click('Tải lại trạng thái');
    expect(screen.getByRole('button', { name: 'Vào hàng — Sẵn sàng' }).hasAttribute('disabled')).toBe(true);
  });

  it('does not retry an unknown network outcome until refreshed', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const config = props();
    render(<QueuePanel {...config} />);
    await click('Vào hàng — Sẵn sàng');
    expect(screen.getByRole('alert').textContent).toContain('chưa rõ thao tác');
    expect(screen.getByRole('button', { name: 'Vào hàng — Sẵn sàng' }).hasAttribute('disabled')).toBe(true);
    await click('Tải lại trạng thái');
    expect(config.onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Vào hàng — Sẵn sàng' }).hasAttribute('disabled')).toBe(false);
  });

  it('keeps a known success closed if refresh fails', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    render(<QueuePanel {...props({ onRefresh: vi.fn().mockRejectedValue(new Error('offline')) })} />);
    await click('Vào hàng — Sẵn sàng');
    expect(screen.getByRole('alert').textContent).toContain('Thao tác đã được ghi nhận');
    expect(screen.getByRole('button', { name: 'Vào hàng — Sẵn sàng' }).hasAttribute('disabled')).toBe(true);
  });

  it('ignores a late response after switching buildings and aborts the old request', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const first = props();
    const view = render(<QueuePanel {...first} />);
    fireEvent.click(screen.getByRole('button', { name: 'Vào hàng — Sẵn sàng' }));
    const signal = fetchMock.mock.calls[0][1]?.signal;
    const second = props({ buildingId: 'building-b' });
    view.rerender(<QueuePanel {...second} />);
    expect(signal?.aborted).toBe(true);
    await act(async () => { finish(new Response(null, { status: 201 })); });
    expect(first.onRefresh).not.toHaveBeenCalled();
    expect(second.onRefresh).not.toHaveBeenCalled();
    expect(screen.queryByText(/Đã ghi nhận yêu cầu/)).toBeNull();
  });
});
