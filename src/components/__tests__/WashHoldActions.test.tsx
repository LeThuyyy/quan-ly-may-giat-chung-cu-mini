// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WashHoldActions from '../WashHoldActions';
import type { MachineHoldView } from '../MachineHoldCard';
import type { WashCycleView } from '../WashCycleCard';

const expiresAt = '2026-11-24T10:08:00Z';
const hold: MachineHoldView = {
  id: 'hold-a', machineId: 'machine-a', accountId: 'resident-a', queueEntryId: 'entry-a',
  expiresAt, physicallyChecked: true,
};
const previousCycle: WashCycleView = {
  id: 'cycle-old', machineId: hold.machineId, queueEntryId: 'entry-old', accountId: 'resident-old',
  ownerName: 'Cư dân trước', startHoldId: 'hold-old', startedAt: '2026-11-24T09:15:00Z',
  durationMinutes: 45, estimatedEndAt: '2026-11-24T10:00:00Z', inspectionAt: '2026-11-24T10:00:00Z',
  serverNow: '2026-11-24T10:00:00Z', handoverMode: 'ALLOW_TRANSFER', state: 'ACTIVE',
  overrunReports: 0, completedAt: null, completion: null, phase: 'INSPECTION_ELIGIBLE',
};
const fetchMock = vi.fn<typeof fetch>();
function view(value = hold, handover: WashCycleView | null | undefined = null) {
  const onRefresh = vi.fn().mockResolvedValue(undefined);
  const rendered = render(<WashHoldActions buildingId="building-a" hold={value} handover={handover}
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

  it('reports a technical fault with a previous cycle without reporting running or allowing start', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const config = view({ ...hold, physicallyChecked: false }, previousCycle);
    await tick();
    const reportBtn = screen.getByRole('button', { name: 'Báo máy chưa dùng được' });
    expect(reportBtn.hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Báo máy vẫn chạy' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xác nhận đã chuyển đồ' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Bắt đầu giặt' })).toBeNull();
    await act(async () => { fireEvent.click(reportBtn); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/buildings/building-a/holds/hold-a/unusable',
      expect.objectContaining({ method: 'POST', cache: 'no-store' }));
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined();
    expect(config.onRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not offer the technical-fault action when previous-cycle data is unknown', async () => {
    render(<WashHoldActions buildingId="building-a" hold={hold} handover={undefined}
      onRefresh={vi.fn()} onSessionExpired={vi.fn()} />);
    await tick();
    expect(screen.queryByRole('button', { name: 'Báo máy chưa dùng được' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bắt đầu giặt' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('disables the technical-fault action with a previous cycle at the exact deadline', async () => {
    view(hold, previousCycle);
    const reportBtn = screen.getByRole('button', { name: 'Báo máy chưa dùng được' });
    expect(reportBtn.hasAttribute('disabled')).toBe(true);
    await tick();
    expect(reportBtn.hasAttribute('disabled')).toBe(false);
    vi.setSystemTime(new Date(expiresAt));
    await tick();
    expect(reportBtn.hasAttribute('disabled')).toBe(true);
    await act(async () => { fireEvent.click(reportBtn); });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rechecks the technical-fault deadline before a throttled timer ticks', async () => {
    view(hold, previousCycle);
    await tick();
    const reportBtn = screen.getByRole('button', { name: 'Báo máy chưa dùng được' });
    expect(reportBtn.hasAttribute('disabled')).toBe(false);
    vi.setSystemTime(new Date(expiresAt));
    await act(async () => { fireEvent.click(reportBtn); });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('disables the technical-fault action after the server rejects a stale hold', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Lượt giữ không còn hiệu lực.' }), { status: 409 }));
    view(hold, previousCycle);
    await tick();
    const reportBtn = screen.getByRole('button', { name: 'Báo máy chưa dùng được' });
    await act(async () => { fireEvent.click(reportBtn); });
    expect(reportBtn.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Báo máy vẫn chạy' }).hasAttribute('disabled')).toBe(true);
    await act(async () => { fireEvent.click(reportBtn); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('blocks duplicate fault reports while busy and ignores a response after scope unmount', async () => {
    let resolveResponse!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>(resolve => { resolveResponse = resolve; }));
    const config = view(hold, previousCycle);
    await tick();
    const reportBtn = screen.getByRole('button', { name: 'Báo máy chưa dùng được' });
    await act(async () => { fireEvent.click(reportBtn); });
    expect(reportBtn.hasAttribute('disabled')).toBe(true);
    await act(async () => { fireEvent.click(reportBtn); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const signal = fetchMock.mock.calls[0][1]?.signal;
    config.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => { resolveResponse(new Response(null, { status: 200 })); });
    expect(config.onRefresh).not.toHaveBeenCalled();
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
