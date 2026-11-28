// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WashCycleCard, { type WashCycleView } from '../WashCycleCard';

const cycle: WashCycleView = {
  id: 'cycle1', machineId: 'machine1', queueEntryId: 'queue1', accountId: 'owner', ownerName: 'Owner',
  startHoldId: 'hold1', startedAt: '2026-11-28T00:00:00Z', durationMinutes: 45,
  estimatedEndAt: '2026-11-28T00:45:00Z', inspectionAt: '2026-11-28T00:45:00Z', serverNow: '2026-11-28T00:10:00Z',
  handoverMode: 'ALLOW_TRANSFER', state: 'ACTIVE', overrunReports: 0, completedAt: null, completion: null, phase: 'RUNNING',
};
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('owner remaining-time operation identity', () => {
  it('keeps the same request ID on a retry after uncertain delivery and refresh', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('response lost')).mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<WashCycleCard buildingId="building1" cycles={[cycle]} machineLabels={{}} onRefresh={onRefresh} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Báo phút còn lại (dời một lần)' }));
    await screen.findByText('Mất kết nối, chưa rõ kết quả. Hãy tải lại trước.');
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại trạng thái' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Báo phút còn lại (dời một lần)' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Báo phút còn lại (dời một lần)' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const first = JSON.parse(fetch.mock.calls[0][1].body);
    const second = JSON.parse(fetch.mock.calls[1][1].body);
    expect(first.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toEqual(first);
    expect(first.remainingMinutes).toBe(10);
  });
  it('uses a new request ID when the user deliberately changes minutes after refresh', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('network'));
    vi.stubGlobal('fetch', fetch);
    render(<WashCycleCard buildingId="building1" cycles={[cycle]} machineLabels={{}} onRefresh={vi.fn().mockResolvedValue(undefined)} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Báo phút còn lại (dời một lần)' }));
    await screen.findByText('Mất kết nối, chưa rõ kết quả. Hãy tải lại trước.');
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại trạng thái' }));
    await waitFor(() => expect((screen.getByRole('spinbutton') as HTMLInputElement).disabled).toBe(false));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Báo phút còn lại (dời một lần)' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const first = JSON.parse(fetch.mock.calls[0][1].body), second = JSON.parse(fetch.mock.calls[1][1].body);
    expect(second.clientRequestId).not.toBe(first.clientRequestId);
    expect(second.remainingMinutes).toBe(12);
  });
});
