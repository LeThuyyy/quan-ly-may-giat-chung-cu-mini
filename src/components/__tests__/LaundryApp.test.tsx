// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LaundryApp from '../LaundryApp';
import { snapshotFixture } from './snapshot-fixture';

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  try {
    window.history.replaceState({}, '', '/');
    window.sessionStorage.clear();
  } catch {
    // Ignore in jsdom.
  }
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('LaundryApp integration', () => {
  it('renders overview hold card and separates manager views into sidebar routes', async () => {
    const expiresAt = new Date(Date.now() + 8 * 60_000).toISOString();

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/buildings/b-1/snapshot') return snapshotFixture(fetchMock, 'b-1');
      if (url === '/api/me') {
        return jsonResponse({ id: 'mgr-1', username: 'manager1', displayName: 'Quản lý 1' });
      }
      if (url === '/api/buildings') {
        return jsonResponse([{ id: 'b-1', name: 'Chung cư Mini A', role: 'MANAGER', status: 'APPROVED' }]);
      }
      if (url === '/api/buildings/b-1') {
        return jsonResponse({
          id: 'b-1',
          name: 'Chung cư Mini A',
          machines: [{ id: 'm-1', label: 'Máy 1', status: 'AVAILABLE' }],
          queue: [],
        });
      }
      if (url === '/api/buildings/b-1/queue/me') {
        return jsonResponse({
          state: 'HELD',
          queueEntryId: null,
          ready: null,
          holdId: 'hold-1',
          machineId: 'm-1',
          expiresAt,
          serverNow: new Date().toISOString(),
        });
      }
      if (url === '/api/buildings/b-1/holds') {
        return jsonResponse([
          {
            id: 'hold-1',
            machineId: 'm-1',
            accountId: 'mgr-1',
            expiresAt,
            serverNow: new Date().toISOString(),
          },
        ]);
      }
      if (url === '/api/buildings/b-1/wash-cycles/me' || url === '/api/buildings/b-1/wash-cycles/issues') {
        return jsonResponse([]);
      }
      if (url === '/api/buildings/b-1/holds/hold-1/handover') {
        return jsonResponse(null);
      }
      if (url === '/api/buildings/b-1/members/pending') {
        return jsonResponse([{ id: 'res-2', username: 'resident2', displayName: 'Cư dân 2' }]);
      }
      if (url === '/api/buildings/b-1/members') {
        return jsonResponse([
          { id: 'mgr-1', username: 'manager1', displayName: 'Quản lý 1', role: 'MANAGER', status: 'APPROVED' },
          { id: 'res-1', username: 'resident1', displayName: 'Cư dân 1', role: 'RESIDENT', status: 'APPROVED' },
        ]);
      }
      if (url.startsWith('/api/buildings/b-1/invitations?')) {
        return jsonResponse({ items: [], page: 0, size: 20, hasNext: false });
      }
      return jsonResponse({ error: 'Unexpected URL: ' + url }, 404);
    });

    render(<LaundryApp />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Chung cư Mini A' })).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: 'Tôi đã kiểm tra máy tại chỗ' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Lượt giữ máy của bạn' })).toBeTruthy();

    // Navigate to Quản lý máy
    fireEvent.click(screen.getByRole('button', { name: 'Quản lý máy' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Đánh dấu bảo trì' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Xác nhận máy trống' })).toBeTruthy();
    });

    // Navigate to Mã mời
    fireEvent.click(screen.getByRole('button', { name: 'Mã mời' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Tạo mã mời 7 ngày' })).toBeTruthy();
    });

    // Navigate to Thành viên
    fireEvent.click(screen.getByRole('button', { name: /Thành viên/ }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Quản lý thành viên' })).toBeTruthy();
    });
  });

  it('locks actions and reports refresh failure when queue/me or holds fails', async () => {
    let failRefresh = false;

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/buildings/b-1/snapshot') return snapshotFixture(fetchMock, 'b-1');
      if (url === '/api/me') {
        return jsonResponse({ id: 'mgr-1', username: 'manager1', displayName: 'Quản lý 1' });
      }
      if (url === '/api/buildings') {
        return jsonResponse([{ id: 'b-1', name: 'Chung cư Mini A', role: 'MANAGER', status: 'APPROVED' }]);
      }
      if (url === '/api/buildings/b-1') {
        return jsonResponse({
          id: 'b-1',
          name: 'Chung cư Mini A',
          machines: [{ id: 'm-1', label: 'Máy 1', status: 'AVAILABLE' }],
          queue: [],
        });
      }
      if (url === '/api/buildings/b-1/queue/me') {
        if (failRefresh) return jsonResponse({ error: 'Upstream timeout' }, 502);
        return jsonResponse({
          state: 'NONE',
          queueEntryId: null,
          ready: null,
          holdId: null,
          machineId: null,
          expiresAt: null,
          serverNow: new Date().toISOString(),
        });
      }
      if (url === '/api/buildings/b-1/holds') {
        if (failRefresh) return jsonResponse({ error: 'Upstream timeout' }, 502);
        return jsonResponse([]);
      }
      if (url === '/api/buildings/b-1/wash-cycles/me' || url === '/api/buildings/b-1/wash-cycles/issues') {
        return jsonResponse([]);
      }
      if (url === '/api/buildings/b-1/holds/hold-1/handover') {
        return jsonResponse(null);
      }
      if (url === '/api/buildings/b-1/members/pending') {
        return jsonResponse([]);
      }
      if (url === '/api/buildings/b-1/members') {
        return jsonResponse([
          { id: 'mgr-1', username: 'manager1', displayName: 'Quản lý 1', role: 'MANAGER', status: 'APPROVED' },
        ]);
      }
      if (url.startsWith('/api/buildings/b-1/invitations?')) {
        return jsonResponse({ items: [], page: 0, size: 20, hasNext: false });
      }
      return jsonResponse({ error: 'Unexpected URL: ' + url }, 404);
    });

    render(<LaundryApp initialView="admin-machines" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Đánh dấu bảo trì' }).hasAttribute('disabled')).toBe(false);
    });

    failRefresh = true;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));
    });

    await waitFor(() => {
      expect(screen.getByText(/Refresh thất bại:/)).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: 'Đánh dấu bảo trì' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Xác nhận máy trống' })).toBeNull();
  });

  it('updates role and hides manager navigation and actions when demoted by another manager', async () => {
    let currentRole: 'MANAGER' | 'RESIDENT' = 'MANAGER';

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/buildings/b-1/snapshot') return snapshotFixture(fetchMock, 'b-1');
      if (url === '/api/me') {
        return jsonResponse({ id: 'mgr-2', username: 'manager2', displayName: 'Quản lý 2' });
      }
      if (url === '/api/buildings') {
        return jsonResponse([{ id: 'b-1', name: 'Chung cư Mini A', role: currentRole, status: 'APPROVED' }]);
      }
      if (url === '/api/buildings/b-1') {
        return jsonResponse({
          id: 'b-1',
          name: 'Chung cư Mini A',
          machines: [{ id: 'm-1', label: 'Máy 1', status: 'AVAILABLE' }],
          queue: [],
        });
      }
      if (url === '/api/buildings/b-1/queue/me') {
        return jsonResponse({
          state: 'NONE',
          queueEntryId: null,
          ready: null,
          holdId: null,
          machineId: null,
          expiresAt: null,
          serverNow: new Date().toISOString(),
        });
      }
      if (url === '/api/buildings/b-1/holds') {
        return jsonResponse([]);
      }
      if (url === '/api/buildings/b-1/wash-cycles/me' || url === '/api/buildings/b-1/wash-cycles/issues') {
        return jsonResponse([]);
      }
      if (url === '/api/buildings/b-1/holds/hold-1/handover') {
        return jsonResponse(null);
      }
      if (url === '/api/buildings/b-1/members/pending') {
        if (currentRole !== 'MANAGER') return jsonResponse({ error: 'Forbidden' }, 403);
        return jsonResponse([]);
      }
      if (url === '/api/buildings/b-1/members') {
        if (currentRole !== 'MANAGER') return jsonResponse({ error: 'Forbidden' }, 403);
        return jsonResponse([
          { id: 'mgr-1', username: 'manager1', displayName: 'Quản lý 1', role: 'MANAGER', status: 'APPROVED' },
          { id: 'mgr-2', username: 'manager2', displayName: 'Quản lý 2', role: 'MANAGER', status: 'APPROVED' },
        ]);
      }
      return jsonResponse({ error: 'Unexpected URL: ' + url }, 404);
    });

    render(<LaundryApp initialView="admin-machines" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Đánh dấu bảo trì' })).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: 'Quản lý máy' })).toBeTruthy();

    currentRole = 'RESIDENT';
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));
    });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Quản lý máy' })).toBeNull();
    });

    expect(screen.queryByRole('button', { name: 'Đánh dấu bảo trì' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xác nhận máy trống' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mã mời' })).toBeNull();
  });
});
