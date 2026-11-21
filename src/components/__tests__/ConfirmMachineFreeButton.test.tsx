// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConfirmMachineFreeButton, { type ConfirmMachineFreeButtonProps } from '../ConfirmMachineFreeButton';

const fetchMock = vi.fn<typeof fetch>();
const acknowledgement = 'Tôi đã kiểm tra tại chỗ: máy đã dừng và lồng giặt trống';
function props(overrides: Partial<ConfirmMachineFreeButtonProps> = {}): ConfirmMachineFreeButtonProps {
  return {
    buildingId: 'building-a', accountId: 'manager-a', isManager: true,
    machine: { id: 'machine-a', label: 'Máy 1', status: 'AVAILABLE' }, hasActiveHold: false,
    onRefresh: vi.fn().mockResolvedValue(undefined), onSessionExpired: vi.fn(), ...overrides,
  };
}
async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })); });
}
async function acknowledge() {
  await click('Xác nhận máy trống');
  fireEvent.click(screen.getByRole('checkbox', { name: acknowledgement }));
}
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ConfirmMachineFreeButton', () => {
  it('hides the control from non-managers and when manager permission is removed', async () => {
    const config = props();
    const view = render(<ConfirmMachineFreeButton {...config} />);
    await acknowledge();
    view.rerender(<ConfirmMachineFreeButton {...config} isManager={false} />);
    expect(screen.queryByRole('group')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires explicit physical confirmation and cancellation clears the checkbox', async () => {
    render(<ConfirmMachineFreeButton {...props()} />);
    await click('Xác nhận máy trống');
    expect(screen.getByText(/Đồng hồ về 0/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ghi nhận máy trống' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: acknowledgement }));
    expect(screen.getByRole('button', { name: 'Ghi nhận máy trống' }).hasAttribute('disabled')).toBe(false);
    await click('Hủy');
    await click('Xác nhận máy trống');
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['AVAILABLE', 'NEEDS_CHECK'])('confirms eligible %s and refreshes without claiming the machine stayed free', async (status) => {
    const config = props({ machine: { id: 'machine-a', label: 'Máy 1', status } });
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    render(<ConfirmMachineFreeButton {...config} />);
    await acknowledge();
    await click('Ghi nhận máy trống');
    expect(fetchMock).toHaveBeenCalledWith('/api/buildings/building-a/machines/machine-a/confirm-free',
      expect.objectContaining({ method: 'POST', cache: 'no-store' }));
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined();
    expect(config.onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toContain('Máy có thể được giao ngay');
    expect(screen.getByRole('button', { name: 'Đã ghi nhận máy trống' }).hasAttribute('disabled')).toBe(true);
  });

  it.each([
    ['RUNNING', false], ['MAINTENANCE', false], ['FUTURE_STATE', false], ['AVAILABLE', true], ['AVAILABLE', null],
  ] as const)('blocks unsafe or unknown state %s, held=%s', async (status, hasActiveHold) => {
    render(<ConfirmMachineFreeButton {...props({ machine: { id: 'machine-a', label: 'Máy 1', status }, hasActiveHold })} />);
    expect(screen.getByRole('button', { name: 'Xác nhận máy trống' }).hasAttribute('disabled')).toBe(true);
    await click('Xác nhận máy trống');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prevents duplicate submissions while request is in flight', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<ConfirmMachineFreeButton {...props()} />);
    await acknowledge();
    fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận máy trống' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đang xử lý…' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { finish(new Response(null, { status: 200 })); });
  });

  it.each([401, 403])('keeps permission failure %s blocked even after a refresh', async (status) => {
    const config = props();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Không có quyền.' }), { status }));
    render(<ConfirmMachineFreeButton {...config} />);
    await acknowledge();
    await click('Ghi nhận máy trống');
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(config.onSessionExpired).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
    await click('Tải lại trạng thái');
    expect(screen.getByRole('button', { name: 'Ghi nhận máy trống' }).hasAttribute('disabled')).toBe(true);
  });

  it.each([409, 502])('requires refresh and a new physical confirmation after error %s', async (status) => {
    const config = props();
    fetchMock.mockResolvedValue(new Response(status === 409 ? JSON.stringify({ error: 'Máy đang có lượt giữ.' }) : 'Bad gateway', { status }));
    render(<ConfirmMachineFreeButton {...config} />);
    await acknowledge();
    await click('Ghi nhận máy trống');
    expect(screen.getByRole('button', { name: 'Ghi nhận máy trống' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('status')).toBeNull();
    await click('Tải lại trạng thái');
    expect(config.onRefresh).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole('button', { name: 'Ghi nhận máy trống' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Ghi nhận máy trống' }).hasAttribute('disabled')).toBe(false);
  });

  it('treats a network failure as unknown rather than success or retrying automatically', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    render(<ConfirmMachineFreeButton {...props()} />);
    await acknowledge();
    await click('Ghi nhận máy trống');
    expect(screen.getByRole('alert').textContent).toContain('chưa rõ xác nhận');
    expect(screen.getByRole('button', { name: 'Ghi nhận máy trống' }).hasAttribute('disabled')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves a known success if the following refresh fails', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    render(<ConfirmMachineFreeButton {...props({ onRefresh: vi.fn().mockRejectedValue(new Error('offline')) })} />);
    await acknowledge();
    await click('Ghi nhận máy trống');
    expect(screen.getByRole('status').textContent).toContain('Đã ghi nhận');
    expect(screen.getByRole('alert').textContent).toContain('Không gửi lại');
    expect(screen.getByRole('button', { name: 'Ghi nhận máy trống' }).hasAttribute('disabled')).toBe(true);
  });

  it('aborts and ignores old responses when switching building or account', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const first = props();
    const view = render(<ConfirmMachineFreeButton {...first} />);
    await acknowledge();
    fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận máy trống' }));
    const signal = fetchMock.mock.calls[0][1]?.signal;
    const second = props({ buildingId: 'building-b', accountId: 'manager-b' });
    view.rerender(<ConfirmMachineFreeButton {...second} />);
    expect(signal?.aborted).toBe(true);
    await act(async () => { finish(new Response(null, { status: 200 })); });
    expect(first.onRefresh).not.toHaveBeenCalled();
    expect(second.onRefresh).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('clears acknowledgement when server status or hold presence changes', async () => {
    const config = props();
    const view = render(<ConfirmMachineFreeButton {...config} />);
    await acknowledge();
    view.rerender(<ConfirmMachineFreeButton {...config} hasActiveHold={true} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Xác nhận máy trống' }).hasAttribute('disabled')).toBe(true);
    view.rerender(<ConfirmMachineFreeButton {...config} />);
    await click('Xác nhận máy trống');
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  });
});
