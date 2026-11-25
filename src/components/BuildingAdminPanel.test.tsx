// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BuildingAdminPanel, { BuildingAdminPanelProps } from './BuildingAdminPanel';

const fetchMock = vi.fn();
const invite = { id: 'invite', createdAt: '2026-01-01', expiresAt: '2026-01-08', revokedAt: null, status: 'ACTIVE' };
const member = { id: 'resident', username: 'cu-dan', displayName: 'Cư dân A', role: 'RESIDENT', status: 'APPROVED' };
function response(data: unknown, status = 200) { return { ok: status < 400, status, json: async () => data } as Response; }
function page(items: unknown[], number = 0, hasNext = false) { return response({ items, page: number, size: 20, hasNext }); }
function props(): BuildingAdminPanelProps { return { buildingId: 'building', accountId: 'me', isManager: true, onRefresh: vi.fn().mockResolvedValue(undefined), onSessionExpired: vi.fn() }; }
async function loaded() { await screen.findByText(/Còn hiệu lực/); }
function click(label: string) { fireEvent.click(screen.getByRole('button', { name: label })); }
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); fetchMock.mockResolvedValue(page([invite])); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('BuildingAdminPanel', () => {
  it('does not render or load for residents', () => {
    render(<BuildingAdminPanel {...props()} isManager={false} />);
    expect(screen.queryByRole('region')).toBeNull(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('loads only its current tab without polling and paginates', async () => {
    fetchMock.mockResolvedValueOnce(page([invite], 0, true)).mockResolvedValueOnce(page([], 1));
    render(<BuildingAdminPanel {...props()} />); await loaded();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/buildings/building/invitations?page=0&size=20');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store', signal: expect.any(AbortSignal) });
    click('Trang sau'); await screen.findByText('Trang 2');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toContain('page=1&size=20');
  });
  it('revokes once without body and refreshes both parent and current tab', async () => {
    const p = props(); render(<BuildingAdminPanel {...p} />); await loaded();
    let resolve!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }));
    const button = screen.getByRole('button', { name: 'Thu hồi' });
    fireEvent.click(button); fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]).toEqual(['/api/buildings/building/invitations/invite/revoke', expect.objectContaining({ method: 'POST', cache: 'no-store' })]);
    expect(fetchMock.mock.calls[1][1].body).toBeUndefined();
    await act(async () => { resolve(response(null, 204)); });
    await waitFor(() => expect(p.onRefresh).toHaveBeenCalledTimes(1));
    await loaded(); expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it('allows revocation only on ACTIVE rows', async () => {
    fetchMock.mockResolvedValue(page([{ ...invite, status: 'EXPIRED' }, { ...invite, id: 'second', status: 'REVOKED' }]));
    render(<BuildingAdminPanel {...props()} />); await screen.findByText(/Đã thu hồi/);
    for (const button of screen.getAllByRole('button', { name: 'Thu hồi' })) expect((button as HTMLButtonElement).disabled).toBe(true);
  });
  it('loads approved residents and excludes managers, self and pending, confirms removal cleanup', async () => {
    render(<BuildingAdminPanel {...props()} />); await loaded();
    fetchMock.mockResolvedValueOnce(response([member, { ...member, id: 'me', displayName: 'Tôi' }, { ...member, id: 'manager', role: 'MANAGER' }, { ...member, id: 'pending', status: 'PENDING' }]));
    click('Gỡ cư dân'); const select = await screen.findByRole('combobox');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    fireEvent.change(select, { target: { value: 'resident' } }); click('Gỡ khỏi tòa');
    expect(screen.getByText(/WAITING/).textContent).toContain('HELD');
    expect(screen.getByText(/WAITING/).textContent).toContain('WASHING');
    fetchMock.mockResolvedValueOnce(response({ error: 'Đang giặt' }, 409));
    click('Xác nhận gỡ'); await screen.findByRole('alert');
    expect(fetchMock.mock.calls[2][0]).toBe('/api/buildings/building/members/resident');
    expect(fetchMock.mock.calls[2][1].method).toBe('DELETE');
    expect(screen.queryByRole('button', { name: 'Gỡ khỏi tòa' })).toBeNull();
  });
  it('restores removed member to pending, without invoking approval', async () => {
    render(<BuildingAdminPanel {...props()} />); await loaded();
    fetchMock.mockResolvedValueOnce(page([{ ...member, status: 'REMOVED' }])).mockResolvedValueOnce(response(null, 204)).mockResolvedValueOnce(page([]));
    click('Thành viên đã gỡ'); await screen.findByRole('button', { name: 'Khôi phục' }); click('Khôi phục');
    await screen.findByText('Đã khôi phục về Chờ duyệt; cần duyệt riêng.');
    expect(fetchMock.mock.calls[2][0]).toBe('/api/buildings/building/members/resident/restore');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/approve'))).toBe(false);
  });
  it('fails closed after refresh failure until explicit successful reload', async () => {
    const p = props(); vi.mocked(p.onRefresh).mockRejectedValueOnce(new Error('Refresh failed'));
    render(<BuildingAdminPanel {...p} />); await loaded();
    fetchMock.mockResolvedValueOnce(response(null, 204)); click('Thu hồi');
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: 'Thu hồi' })).toBeNull();
    click('Tải lại quản trị'); await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect((screen.getByRole('button', { name: 'Thu hồi' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it.each(['load', 'mutation'])('notifies parent on 401 %s and locks further requests', async (stage) => {
    const p = props();
    if (stage === 'load') fetchMock.mockResolvedValueOnce(response({}, 401));
    render(<BuildingAdminPanel {...p} />);
    if (stage === 'mutation') { await loaded(); fetchMock.mockResolvedValueOnce(response({}, 401)); click('Thu hồi'); }
    await waitFor(() => expect(p.onSessionExpired).toHaveBeenCalledTimes(1));
    expect((screen.getByRole('button', { name: 'Tải lại quản trị' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('ignores old mutation after account scope changes and aborts it', async () => {
    const p = props(); const view = render(<BuildingAdminPanel {...p} />); await loaded();
    let resolve!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; })); click('Thu hồi');
    const signal = fetchMock.mock.calls[1][1].signal as AbortSignal;
    view.rerender(<BuildingAdminPanel {...p} accountId="other" buildingId="other-building" />);
    await loaded(); expect(signal.aborted).toBe(true);
    await act(async () => { resolve(response({}, 401)); });
    expect(p.onRefresh).not.toHaveBeenCalled(); expect(p.onSessionExpired).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('ignores fetch results after unmount and aborts reads', async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }));
    const p = props(); const view = render(<BuildingAdminPanel {...p} />);
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    view.unmount(); expect(signal.aborted).toBe(true);
    await act(async () => { resolve(response({}, 401)); }); expect(p.onSessionExpired).not.toHaveBeenCalled();
  });
  it('fails closed on uncertain network mutation and reloads before retry', async () => {
    render(<BuildingAdminPanel {...props()} />); await loaded();
    fetchMock.mockRejectedValueOnce(new Error('Offline')); click('Thu hồi');
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: 'Thu hồi' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Gỡ cư dân' }) as HTMLButtonElement).disabled).toBe(true);
    click('Tải lại quản trị'); await loaded();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it('does not apply an old read after changing building', async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }));
    const p = props(); const view = render(<BuildingAdminPanel {...p} />);
    view.rerender(<BuildingAdminPanel {...p} buildingId="new-building" />); await loaded();
    await act(async () => { resolve(page([{ ...invite, id: 'old-invite' }])); });
    expect(screen.queryByText(/old-invite/)).toBeNull();
    expect(p.onSessionExpired).not.toHaveBeenCalled();
  });
  it('renders audit content as plain text and loads only on demand', async () => {
    render(<BuildingAdminPanel {...props()} />); await loaded();
    fetchMock.mockResolvedValueOnce(page([{ id: 'event', action: '<script>alert(1)</script>', actorId: null, targetId: null, machineId: null, beforeState: null, afterState: 'REMOVED', occurredAt: '2026-01-01' }]));
    click('Nhật ký hoạt động'); await screen.findByText('<script>alert(1)</script>');
    expect(document.querySelector('script')).toBeNull();
    expect(fetchMock.mock.calls[1][0]).toBe('/api/buildings/building/activity?page=0&size=20');
  });
});
