import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { callJavaWithSession } from '../java-bridge';
import { GET } from '../../app/api/buildings/[id]/queue/me/route';

vi.mock('../java-bridge', () => ({ callJavaWithSession: vi.fn() }));
const bridge = vi.mocked(callJavaWithSession);
const id = '11111111-1111-4111-8111-111111111111';
const path = `/api/buildings/${id}/queue/me`;
const session = 'a'.repeat(64);
function request(cookie = true) {
  return new NextRequest(`http://localhost:3000${path}?accountId=someone-else`, {
    headers: cookie ? { Cookie: `laundry_session=${session}` } : {},
  });
}
beforeEach(() => vi.resetAllMocks());

describe('personal queue status GET route', () => {
  it.each(['NONE', 'WAITING', 'HELD', 'WASHING'])('forwards %s without overriding the authenticated account', async (state) => {
    const payload = { state, serverNow: '2026-11-21T10:00:00Z', queueEntryId: null, ready: null, holdId: null, machineId: null, expiresAt: null };
    bridge.mockResolvedValue({ ok: true, status: 200, data: payload });
    const response = await GET(request(), { params: Promise.resolve({ id }) });
    expect(bridge).toHaveBeenCalledWith(session, 'GET', path);
    expect(await response.json()).toEqual(payload);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('rejects an invalid building ID without contacting Java', async () => {
    const response = await GET(request(), { params: Promise.resolve({ id: 'bad' }) });
    expect(response.status).toBe(400);
    expect(bridge).not.toHaveBeenCalled();
  });

  it('returns 401 and clears the cookie when the Java session is invalid', async () => {
    bridge.mockResolvedValue({ ok: false, status: 401, error: 'Phiên đã hết hạn.', clearSessionCookie: true });
    const response = await GET(request(false), { params: Promise.resolve({ id }) });
    expect(bridge).toHaveBeenCalledWith(undefined, 'GET', path);
    expect(response.status).toBe(401);
    expect(response.cookies.get('laundry_session')?.value).toBe('');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it.each([403, 404, 409, 502])('preserves backend error %s instead of inventing NONE', async (status) => {
    bridge.mockResolvedValue({ ok: false, status, error: 'Không đọc được trạng thái.' });
    const response = await GET(request(), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: 'Không đọc được trạng thái.' });
  });
});
