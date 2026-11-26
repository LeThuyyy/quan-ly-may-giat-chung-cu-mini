// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WashHoldActions from '../WashHoldActions';
import type { MachineHoldView } from '../MachineHoldCard';

const expiresAt = '2026-11-24T10:08:00Z';
const hold: MachineHoldView = {
  id: 'hold-a', machineId: 'machine-a', accountId: 'resident-a', queueEntryId: 'entry-a',
  expiresAt, physicallyChecked: true,
};
const fetchMock = vi.fn<typeof fetch>();
function view(value = hold) {
  const onRefresh = vi.fn().mockResolvedValue(undefined);
  const rendered = render(<WashHoldActions buildingId="building-a" hold={value} handover={null}
    onRefresh={onRefresh} onSessionExpired={vi.fn()} />);
  return { ...rendered, onRefresh };
}
async function tick() { await act(async () => { vi.advanceTimersByTime(250); }); }
function startButton() { return screen.getByRole('button', { name: 'Bắt đầu giặt' }); }

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-24T10:00:00Z'));
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('WashHoldActions deadline checks', () => {
  it('waits for the client clock and then submits the explicit wash payload', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const config = view();
    expect(startButton().hasAttribute('disabled')).toBe(true);
    await tick();
    expect(startButton().hasAttribute('disabled')).toBe(false);
    await act(async () => { fireEvent.click(startButton()); });
    expect(fetchMock).toHaveBeenCalledWith('/api/buildings/building-a/holds/hold-a/start',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ durationMinutes: 45, handoverMode: 'ALLOW_TRANSFER' }) }));
    expect(config.onRefresh).toHaveBeenCalledTimes(1);
  });

  it('allows the pre-deadline state but disables start at the exact deadline', async () => {
    view();
    vi.setSystemTime(new Date(Date.parse(expiresAt) - 1000));
    await tick();
    expect(startButton().hasAttribute('disabled')).toBe(false);
    vi.setSystemTime(new Date(expiresAt));
    await tick();
    expect(startButton().hasAttribute('disabled')).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rechecks wall time on click when the timer has not ticked', async () => {
    view();
    await tick();
    expect(startButton().hasAttribute('disabled')).toBe(false);
    vi.setSystemTime(new Date(expiresAt));
    await act(async () => { fireEvent.click(startButton()); });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed for a malformed deadline', async () => {
    view({ ...hold, expiresAt: 'invalid' });
    await tick();
    expect(startButton().hasAttribute('disabled')).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cleans up the clock interval on unmount', async () => {
    const config = view();
    await tick();
    expect(vi.getTimerCount()).toBe(1);
    config.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports an empty assigned machine as unusable and refreshes queue state', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const config = view({ ...hold, physicallyChecked: false });
    await tick();
    const reportBtn = screen.getByRole('button', { name: 'Báo máy chưa dùng được' });
    expect(reportBtn.hasAttribute('disabled')).toBe(false);
    await act(async () => { fireEvent.click(reportBtn); });
    expect(fetchMock).toHaveBeenCalledWith('/api/buildings/building-a/holds/hold-a/unusable',
      expect.objectContaining({ method: 'POST', cache: 'no-store' }));
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined();
    expect(config.onRefresh).toHaveBeenCalledTimes(1);
  });

  it('compensates for client clock skew when serverNow is provided', async () => {
    vi.setSystemTime(new Date('2026-11-24T10:12:00Z'));
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<WashHoldActions buildingId="building-a" hold={hold} handover={null}
      serverNow="2026-11-24T10:04:00Z" onRefresh={onRefresh} onSessionExpired={vi.fn()} />);
    await tick();
    expect(startButton().hasAttribute('disabled')).toBe(false);
    await act(async () => { fireEvent.click(startButton()); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
