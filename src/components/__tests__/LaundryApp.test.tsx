// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LaundryApp from '../LaundryApp';

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
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('LaundryApp integration', () => {
    it('renders integrated queue, hold card, machine actions and member management for an approved manager', async () => {
        const expiresAt = new Date(Date.now() + 8 * 60_000).toISOString();

        fetchMock.mockImplementation(async (input) => {
            const url = String(input);
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
                return jsonResponse([{ accountId: 'res-2', username: 'resident2', displayName: 'Cư dân 2' }]);
            }
            if (url === '/api/buildings/b-1/members') {
                return jsonResponse([
                    { accountId: 'mgr-1', username: 'manager1', displayName: 'Quản lý 1', role: 'MANAGER' },
                    { accountId: 'res-1', username: 'resident1', displayName: 'Cư dân 1', role: 'RESIDENT' },
                ]);
            }
            return jsonResponse({ error: 'Unexpected URL: ' + url }, 404);
        });

        render(<LaundryApp />);

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Chung cư Mini A' })).toBeTruthy();
        });

        expect(
            screen.getByRole('button', { name: 'Tôi đã kiểm tra máy tại chỗ' })
        ).toBeTruthy();

        expect(
            screen.getByText(/Bạn đã được giao máy/)
        ).toBeTruthy();
        // Nút quản lý máy và bảng thành viên hiển thị đầy đủ
        expect(screen.getByRole('button', { name: 'Đánh dấu bảo trì' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Xác nhận máy trống' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Tạo mã mời 7 ngày' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Cấp quyền Quản lý' })).toBeTruthy();
    });

    it('locks actions and reports refresh failure when queue/me or holds fails', async () => {
        let failRefresh = false;

        fetchMock.mockImplementation(async (input) => {
            const url = String(input);
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
                    { accountId: 'mgr-1', username: 'manager1', displayName: 'Quản lý 1', role: 'MANAGER' },
                ]);
            }
            return jsonResponse({ error: 'Unexpected URL: ' + url }, 404);
        });

        render(<LaundryApp />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Tạo mã mời 7 ngày' }).hasAttribute('disabled')).toBe(false);
        });

        // Giả lập lần refresh tiếp theo bị lỗi queue/me và holds
        failRefresh = true;
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));
        });

        await waitFor(() => {
            expect(screen.getByText(/Refresh thất bại:/)).toBeTruthy();
        });

        // Khóa toàn bộ thao tác máy và quản lý thành viên, không coi dữ liệu cũ là đã cập nhật
        expect(screen.getByRole('button', { name: 'Đánh dấu bảo trì' }).hasAttribute('disabled')).toBe(true);
        expect(screen.queryByRole('button', { name: 'Xác nhận máy trống' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Tạo mã mời 7 ngày' }).hasAttribute('disabled')).toBe(true);
    });

    it('updates role and hides manager buttons when demoted by another manager', async () => {
        let currentRole: 'MANAGER' | 'RESIDENT' = 'MANAGER';

        fetchMock.mockImplementation(async (input) => {
            const url = String(input);
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
                    { accountId: 'mgr-1', username: 'manager1', displayName: 'Quản lý 1', role: 'MANAGER' },
                    { accountId: 'mgr-2', username: 'manager2', displayName: 'Quản lý 2', role: 'MANAGER' },
                ]);
            }
            return jsonResponse({ error: 'Unexpected URL: ' + url }, 404);
        });

        render(<LaundryApp />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Tạo mã mời 7 ngày' })).toBeTruthy();
        });
        expect(screen.getByRole('button', { name: 'Đánh dấu bảo trì' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Xác nhận máy trống' })).toBeTruthy();

        // Quản lý khác hạ quyền tài khoản này xuống RESIDENT
        currentRole = 'RESIDENT';
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));
        });

        await waitFor(() => {
            expect(screen.getByText(/Cư dân · Đã duyệt/)).toBeTruthy();
        });

        // Toàn bộ nút quản lý bị ẩn đi
        expect(screen.queryByRole('button', { name: 'Tạo mã mời 7 ngày' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Đánh dấu bảo trì' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Xác nhận máy trống' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Thêm máy' })).toBeNull();
    });
});