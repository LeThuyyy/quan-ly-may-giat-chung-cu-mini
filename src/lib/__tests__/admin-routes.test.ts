import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { callJavaWithSession } from '../java-bridge';
import { GET as invitations, POST as createInvitation } from '../../app/api/buildings/[id]/invitations/route';
import { GET as removed } from '../../app/api/buildings/[id]/members/removed/route';
import { GET as activity } from '../../app/api/buildings/[id]/activity/route';
import { POST as revoke } from '../../app/api/buildings/[id]/invitations/[invitationId]/revoke/route';
import { DELETE as remove } from '../../app/api/buildings/[id]/members/[accountId]/route';
import { POST as restore } from '../../app/api/buildings/[id]/members/[accountId]/restore/route';

vi.mock('../java-bridge', () => ({ callJavaWithSession: vi.fn() }));
const id = '11111111-1111-4111-8111-111111111111';
const child = '22222222-2222-4222-8222-222222222222';
const bridge = vi.mocked(callJavaWithSession);
function req(path: string, method = 'GET', origin = 'http://localhost:3000') {
  return new NextRequest(`http://localhost:3000${path}`, { method, headers: { Host: 'localhost:3000', Origin: origin, Cookie: 'laundry_session=opaque' } });
}
const context = (building = id, resource = child) => ({ params: Promise.resolve({ id: building, accountId: resource, invitationId: resource }) });
beforeEach(() => { vi.resetAllMocks(); bridge.mockResolvedValue({ ok: true, status: 200, data: { items: [], page: 0, size: 20, hasNext: false } }); });

for (const [suffix, handler] of [['invitations', invitations], ['members/removed', removed], ['activity', activity]] as const) {
  describe(`admin GET ${suffix}`, () => {
    const path = `/api/buildings/${id}/${suffix}`;
    it('forwards defaults with opaque session and private no-store', async () => {
      const response = await handler(req(path), context());
      expect(bridge).toHaveBeenCalledWith('opaque', 'GET', `${path}?page=0&size=20`);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect((await response.json()).items).toEqual([]);
    });
    it.each(['?page=-1', '?page=1.2', '?size=0', '?size=51', '?page=9007199254740992', '?page=1&page=2', '?path=/arbitrary'])('rejects invalid query %s', async (query) => {
      expect((await handler(req(path + query), context())).status).toBe(400);
      expect(bridge).not.toHaveBeenCalled();
    });
    it('validates building before bridging', async () => {
      expect((await handler(req(path), context('bad'))).status).toBe(400);
      expect(bridge).not.toHaveBeenCalled();
    });
    it('forwards bounded pagination and session expiry', async () => {
      bridge.mockResolvedValue({ ok: false, status: 401, clearSessionCookie: true, error: 'Hết phiên' });
      const response = await handler(req(path + '?page=2&size=50'), context());
      expect(bridge).toHaveBeenCalledWith('opaque', 'GET', `${path}?page=2&size=50`);
      expect(response.status).toBe(401);
      expect(response.cookies.get('laundry_session')?.value).toBe('');
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    });
  });
}
it('validates activity filters and constructs only allowlisted query', async () => {
  const path = `/api/buildings/${id}/activity`;
  await activity(req(`${path}?type=MEMBER_REMOVED&machineId=${child}`), context());
  expect(bridge).toHaveBeenLastCalledWith('opaque', 'GET', `${path}?page=0&size=20&type=MEMBER_REMOVED&machineId=${child}`);
  bridge.mockClear();
  for (const filter of ['type=bad', 'type=' + 'A'.repeat(61), 'machineId=bad', 'type=A&type=B']) {
    expect((await activity(req(`${path}?${filter}`), context())).status).toBe(400);
  }
  expect(bridge).not.toHaveBeenCalled();
});

for (const [suffix, method, handler] of [
  [`invitations/${child}/revoke`, 'POST', revoke],
  [`members/${child}`, 'DELETE', remove],
  [`members/${child}/restore`, 'POST', restore],
] as const) {
  describe(`admin mutation ${suffix}`, () => {
    const path = `/api/buildings/${id}/${suffix}`;
    it('bridges explicit path without body', async () => {
      const response = await handler(req(path, method), context());
      expect(bridge).toHaveBeenCalledWith('opaque', method, path);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    });
    it('rejects cross-origin before bridging', async () => {
      expect((await handler(req(path, method, 'https://other.example'), context())).status).toBe(403);
      expect(bridge).not.toHaveBeenCalled();
    });
    it.each([['bad', child], [id, 'bad']])('validates both identifiers', async (building, resource) => {
      expect((await handler(req(path, method), context(building, resource))).status).toBe(400);
      expect(bridge).not.toHaveBeenCalled();
    });
    it('preserves conflict and no-store', async () => {
      bridge.mockResolvedValue({ ok: false, status: 409, error: 'Đang giặt' });
      const response = await handler(req(path, method), context());
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'Đang giặt' });
    });
  });
}
it('keeps existing invitation creation POST', async () => {
  const path = `/api/buildings/${id}/invitations`;
  await createInvitation(req(path, 'POST'), context());
  expect(bridge).toHaveBeenCalledWith('opaque', 'POST', path);
});
