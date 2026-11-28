import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { callJavaWithSession } from '../java-bridge';
import { GET } from '@/app/api/push/config/route';
import { POST, DELETE } from '@/app/api/push/subscriptions/route';
import { POST as status } from '@/app/api/push/subscriptions/status/route';

vi.mock('../java-bridge', () => ({ callJavaWithSession: vi.fn() }));
const bridge = vi.mocked(callJavaWithSession);
const endpoint = 'https://fcm.googleapis.com/fcm/send/device';
const session = 'a'.repeat(64);
function request(method = 'POST', body: unknown = { endpoint, keys: { p256dh: 'key', auth: 'auth' } }, origin = 'http://localhost:3000') {
  return new NextRequest('http://localhost:3000/api/push/subscriptions', {
    method, headers: { Host: 'localhost:3000', Origin: origin, Cookie: `laundry_session=${session}`, 'Content-Type': 'application/json' },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  });
}
beforeEach(() => { vi.resetAllMocks(); bridge.mockResolvedValue({ ok: true, status: 204 }); });

describe('push bridge routes', () => {
  it('reads runtime config with opaque session and no-store', async () => {
    bridge.mockResolvedValue({ ok: true, status: 200, data: { enabled: false, publicKey: null } });
    const response = await GET(request('GET'));
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(bridge).toHaveBeenCalledWith(session, 'GET', '/api/push/config');
  });
  it('forwards only subscription fields', async () => {
    await POST(request('POST', { endpoint, keys: { p256dh: 'key', auth: 'auth' }, accountId: 'attacker' }));
    expect(bridge).toHaveBeenCalledWith(session, 'POST', '/api/push/subscriptions', { endpoint, keys: { p256dh: 'key', auth: 'auth' } });
  });
  it('forwards status and deletion without client supplied ownership', async () => {
    await status(request('POST', { endpoint, accountId: 'other' }));
    expect(bridge).toHaveBeenLastCalledWith(session, 'POST', '/api/push/subscriptions/status', { endpoint });
    await DELETE(request('DELETE', { endpoint }));
    expect(bridge).toHaveBeenLastCalledWith(session, 'DELETE', '/api/push/subscriptions', { endpoint });
  });
  it.each([POST, DELETE, status])('rejects cross-origin mutation', async handler => {
    expect((await handler(request('POST', { endpoint }, 'https://evil.example'))).status).toBe(403);
    expect(bridge).not.toHaveBeenCalled();
  });
  it.each([null, {}, { endpoint: 12 }, { endpoint: 'x'.repeat(2049) }, { endpoint, keys: {} }])('rejects malformed subscription %j', async body => {
    expect((await POST(request('POST', body))).status).toBe(400);
    expect(bridge).not.toHaveBeenCalled();
  });
  it('clears invalid session cookie', async () => {
    bridge.mockResolvedValue({ ok: false, status: 401, clearSessionCookie: true });
    const response = await DELETE(request('DELETE', { endpoint }));
    expect(response.status).toBe(401);
    expect(response.cookies.get('laundry_session')?.value).toBe('');
  });
});
