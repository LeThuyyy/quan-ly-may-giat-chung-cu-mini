// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WashCycleCard, { type WashCycleView } from '../WashCycleCard';
import { resolveOwnerAdjustment } from '@/lib/owner-adjustment-requests';

const cycle: WashCycleView = {
  id: 'cycle1', machineId: 'machine1', queueEntryId: 'queue1', accountId: 'owner', ownerName: 'Owner',
  startHoldId: 'hold1', startedAt: '2026-11-28T00:00:00Z', durationMinutes: 45,
  estimatedEndAt: '2026-11-28T00:45:00Z', inspectionAt: '2026-11-28T00:45:00Z', serverNow: '2026-11-28T00:10:00Z',
  handoverMode: 'ALLOW_TRANSFER', state: 'ACTIVE', overrunReports: 0, completedAt: null, completion: null, phase: 'RUNNING',
};
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); resolveOwnerAdjustment('owner:building1:cycle1'); });

describe('owner remaining-time operation identity', () => {
  it('allows an overdue ALLOW_TRANSFER owner to report minutes while server still decides hold eligibility', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    render(<WashCycleCard buildingId="building1" cycles={[{ ...cycle, phase: 'INSPECTION_ELIGIBLE' }]}
      machineLabels={{}} onRefresh={vi.fn().mockResolvedValue(undefined)} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Báo phút còn lại (dời một lần)' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(fetch.mock.calls[0][0]).toContain('/remaining');
  });
  it('does not expose owner defer after SELF_PICKUP window starts', () => {
    render(<WashCycleCard buildingId="building1" cycles={[{ ...cycle, handoverMode: 'SELF_PICKUP', phase: 'SELF_PICKUP' }]}
      machineLabels={{}} onRefresh={vi.fn()} onSessionExpired={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Báo phút còn lại (dời một lần)' })).toBeNull();
  });
  it('keeps the same request ID on a retry after uncertain delivery and refresh', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('response lost')).mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<WashCycleCard buildingId="building1" cycles={[cycle]} machineLabels={{}} onRefresh={onRefresh} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Báo phút còn lại (dời một lần)' }));
    await screen.findByText('Không thể kết nối tới máy chủ. Vui lòng kiểm tra mạng và thử lại.');
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
  it('retains unresolved operation identity when failed sync unmounts and later remounts the card', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('lost response')).mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const view = render(<WashCycleCard buildingId="building1" cycles={[cycle]} machineLabels={{}} onRefresh={vi.fn().mockRejectedValue(new Error('offline'))} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Báo phút còn lại (dời một lần)' }));
    await screen.findByText('Không thể kết nối tới máy chủ. Vui lòng kiểm tra mạng và thử lại.');
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại trạng thái' }));
    await screen.findByText('Tải lại thất bại.');
    view.unmount();
    render(<WashCycleCard buildingId="building1" cycles={[cycle]} machineLabels={{}} onRefresh={vi.fn().mockResolvedValue(undefined)} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Báo phút còn lại (dời một lần)' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetch.mock.calls[1][1].body).clientRequestId).toBe(JSON.parse(fetch.mock.calls[0][1].body).clientRequestId);
  });
  it.each(['headers', 'body'])('bounds a stalled remaining-time request at %s and offers recovery', async stage => {
    vi.useFakeTimers();
    const fetch = vi.fn((_: unknown, init?: RequestInit) => {
      const hang = () => new Promise<never>((_, reject) => init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
      return stage === 'headers' ? hang() : Promise.resolve({ status: 200, ok: true, text: hang });
    });
    vi.stubGlobal('fetch', fetch);
    render(<WashCycleCard buildingId="building1" cycles={[cycle]} machineLabels={{}} onRefresh={vi.fn().mockResolvedValue(undefined)} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Báo phút còn lại (dời một lần)' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.getByRole('alert').textContent).toContain('Yêu cầu quá thời gian');
    expect((screen.getByRole('button', { name: 'Tải lại trạng thái' }) as HTMLButtonElement).disabled).toBe(false);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('uses a new request ID when the user deliberately changes minutes after refresh', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('network'));
    vi.stubGlobal('fetch', fetch);
    render(<WashCycleCard buildingId="building1" cycles={[cycle]} machineLabels={{}} onRefresh={vi.fn().mockResolvedValue(undefined)} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Báo phút còn lại (dời một lần)' }));
    await screen.findByText('Không thể kết nối tới máy chủ. Vui lòng kiểm tra mạng và thử lại.');
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
