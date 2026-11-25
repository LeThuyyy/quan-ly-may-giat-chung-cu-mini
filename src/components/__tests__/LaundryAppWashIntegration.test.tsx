// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LaundryApp from '../LaundryApp';
import { snapshotFixture } from './snapshot-fixture';

const fetchMock = vi.fn<typeof fetch>();
const base = '/api/buildings/b-1';
const deadline = new Date(Date.now() + 480000).toISOString();
const cycle = {
  id: 'cycle-1', machineId: 'm-1', queueEntryId: 'entry-1', accountId: 'mgr-1', ownerName: 'Quản lý 1',
  startHoldId: 'hold-1', startedAt: new Date().toISOString(), durationMinutes: 1,
  estimatedEndAt: deadline, inspectionAt: deadline, serverNow: new Date().toISOString(),
  handoverMode: 'ALLOW_TRANSFER', state: 'ACTIVE', overrunReports: 0, completedAt: null,
  completion: null, phase: 'RUNNING',
};
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status }); }
function fixture(initial: 'NONE' | 'HELD' | 'WASHING' = 'NONE') {
  let role = 'MANAGER';
  let failed: string | null = null;
  let blockMembership: (() => Promise<Response>) | null = null;
  let staleManager403 = false;
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url === `${base}/snapshot`) return snapshotFixture(fetchMock, 'b-1');
    if (url === failed) return json({ error: 'Test upstream failure' }, 502);
    if (url === '/api/me') return json({ id: 'mgr-1', username: 'manager1', displayName: 'Quản lý 1' });
    if (url === '/api/buildings') {
      if (blockMembership) return blockMembership();
      return json([{ id: 'b-1', name: 'Tòa tích hợp', role, status: 'APPROVED' }]);
    }
    if (url === base) return json({ id: 'b-1', name: 'Tòa tích hợp', machines: [{ id: 'm-1', label: 'Máy 1', status: initial === 'WASHING' ? 'RUNNING' : 'AVAILABLE' }], queue: [] });
    if (url === `${base}/queue/me`) return json({ state: initial, queueEntryId: initial === 'NONE' ? null : 'entry-1',
      ready: null, holdId: initial === 'NONE' ? null : 'hold-1', machineId: initial === 'NONE' ? null : 'm-1', expiresAt: deadline, serverNow: new Date().toISOString() });
    if (url === `${base}/holds`) return json(initial === 'HELD' ? [{ id: 'hold-1', machineId: 'm-1', accountId: 'mgr-1', queueEntryId: 'entry-1', expiresAt: deadline, physicallyChecked: true }] : []);
    if (url === `${base}/holds/hold-1/handover`) return json(null);
    if (url === `${base}/wash-cycles/me`) return json(initial === 'WASHING' ? [cycle] : []);
    if (url === `${base}/wash-cycles/issues`) {
      if (staleManager403) return json({ error: 'Forbidden' }, 403);
      return role === 'MANAGER' ? json([]) : json({ error: 'Forbidden' }, 403);
    }
    if (url === `${base}/members/pending`) return json([]);
    if (url === `${base}/members`) return json([{ id: 'mgr-1', username: 'manager1', displayName: 'Quản lý 1', role: 'MANAGER', status: 'APPROVED' }]);
    return json({ error: 'Unexpected URL: ' + url }, 404);
  });
  return {
    fail: (url: string | null) => { failed = url; },
    demote: () => { role = 'RESIDENT'; },
    staleDemote: () => { staleManager403 = true; },
    block: (value: (() => Promise<Response>) | null) => { blockMembership = value; },
  };
}
async function ready() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo mã mời 7 ngày' }).hasAttribute('disabled')).toBe(false));
}
async function refresh() { await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Làm mới' })); }); }
async function stale() { await waitFor(() => expect(screen.getByText(/Refresh thất bại:/)).toBeTruthy()); }
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('combined refresh guards and wash data', () => {
  it('renders the B start form using the verified hold and handover snapshot', async () => {
    fixture('HELD'); render(<LaundryApp />); await ready();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bắt đầu giặt' }).hasAttribute('disabled')).toBe(false));
    expect(screen.getByRole('region', { name: 'Lượt giữ máy của bạn' })).toBeTruthy();
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  it.each([`${base}/wash-cycles/me`, `${base}/wash-cycles/issues`, '/api/buildings'])('locks all mutation surfaces if required endpoint %s fails', async (url) => {
    const config = fixture('WASHING'); render(<LaundryApp />); await ready();
    expect(screen.getByRole('button', { name: 'Xác nhận đã lấy đồ (kể cả lấy sớm)' })).toBeTruthy();
    config.fail(url); await refresh(); await stale();
    expect(screen.queryByRole('button', { name: 'Xác nhận đã lấy đồ (kể cả lấy sớm)' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xác nhận máy trống' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Tạo mã mời 7 ngày' }).hasAttribute('disabled')).toBe(true);
    config.fail(null); await refresh();
    await waitFor(() => expect(screen.queryByText(/Refresh thất bại:/)).toBeNull());
    expect(screen.getByRole('button', { name: 'Xác nhận đã lấy đồ (kể cả lấy sớm)' })).toBeTruthy();
  });

  it('removes the start form when the old-cycle handover cannot be verified', async () => {
    const config = fixture('HELD'); render(<LaundryApp />); await ready();
    config.fail(`${base}/holds/hold-1/handover`); await refresh(); await stale();
    expect(screen.queryByRole('button', { name: 'Bắt đầu giặt' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Lượt giữ máy của bạn' })).toBeNull();
  });

  it('uses fresh resident role without issuing a manager-only wash-issues request', async () => {
    const config = fixture('WASHING'); render(<LaundryApp />); await ready();
    const before = fetchMock.mock.calls.filter(([url]) => String(url) === `${base}/wash-cycles/issues`).length;
    config.demote(); await refresh();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tạo mã mời 7 ngày' })).toBeNull());
    expect(screen.getByRole('region', { name: 'Mẻ giặt của tôi' })).toBeTruthy();
    expect(screen.queryByText(/Refresh thất bại:/)).toBeNull();
    const after = fetchMock.mock.calls.filter(([url]) => String(url) === `${base}/wash-cycles/issues`).length;
    expect(after).toBe(before);
  });

  it('handles permission loss at the issues endpoint without leaving manager controls visible', async () => {
    const config = fixture(); render(<LaundryApp />); await ready();
    config.staleDemote(); await refresh();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tạo mã mời 7 ngày' })).toBeNull());
    expect(screen.queryByRole('button', { name: 'Xác nhận máy trống' })).toBeNull();
  });

  it('does not unlock stale controls while a retry is still pending', async () => {
    const config = fixture(); render(<LaundryApp />); await ready();
    config.fail(`${base}/wash-cycles/me`); await refresh(); await stale();
    config.fail(null);
    const resolves: Array<(response: Response) => void> = [];
    config.block(() => new Promise((done) => { resolves.push(done); }));
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));
    expect(screen.getByRole('button', { name: 'Tạo mã mời 7 ngày' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Xác nhận máy trống' })).toBeNull();
    config.block(null);
    await act(async () => { for (const resolve of resolves) resolve(json([{ id: 'b-1', name: 'Tòa tích hợp', role: 'MANAGER', status: 'APPROVED' }])); });
    await waitFor(() => expect(screen.queryByText(/Refresh thất bại:/)).toBeNull());
  });
});
