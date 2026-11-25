import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { callJavaWithSession } from '../java-bridge';
import { GET, POST } from '../../app/api/buildings/[id]/chat/messages/route';
import { GET as reports } from '../../app/api/buildings/[id]/chat/reports/route';
import { POST as hide } from '../../app/api/buildings/[id]/chat/messages/[messageId]/hide/route';
import { POST as report } from '../../app/api/buildings/[id]/chat/messages/[messageId]/report/route';
vi.mock('../java-bridge', () => ({ callJavaWithSession: vi.fn() }));
const id = '11111111-1111-4111-8111-111111111111';
const messageId = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ id, messageId }) };
const bridge = vi.mocked(callJavaWithSession);
function req(method = 'GET', body?: object, origin = 'http://localhost:3000', query = '') {
  return new NextRequest(`http://localhost:3000/api/buildings/${id}/chat/messages${query}`, { method, headers: { Host: 'localhost:3000', Origin: origin, Cookie: 'laundry_session=opaque', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
beforeEach(() => { vi.resetAllMocks(); bridge.mockResolvedValue({ ok: true, status: 200, data: {} }); });
it('forwards bounded pagination and opaque session only', async () => {
  await GET(req('GET', undefined, undefined, '?page=2&size=5&accountId=evil'), context);
  expect(bridge).toHaveBeenCalledWith('opaque', 'GET', `/api/buildings/${id}/chat/messages?page=2&size=5`);
});
it.each([GET, reports])('rejects invalid pagination before bridging', async read => {
  expect((await read(req('GET', undefined, undefined, '?size=51'), context)).status).toBe(400);
  expect(bridge).not.toHaveBeenCalled();
});
it('strips authority and trims text while retaining request UUID', async () => {
  await POST(req('POST', { clientRequestId: messageId, body: ' hi ', accountId: 'evil' }), context);
  expect(bridge).toHaveBeenCalledWith('opaque', 'POST', `/api/buildings/${id}/chat/messages`, { clientRequestId: messageId, body: 'hi' });
});
it.each([POST, hide, report])('rejects foreign origin on mutations', async mutate => {
  expect((await mutate(req('POST', { clientRequestId: messageId, body: 'hi', reasonCode: 'SPAM' }, 'https://evil.example'), context)).status).toBe(403);
  expect(bridge).not.toHaveBeenCalled();
});
it.each([hide, report])('validates enums and routes no claimed role to backend', async mutate => {
  expect((await mutate(req('POST', { reasonCode: 'UNSAFE' }), context)).status).toBe(400);
  await mutate(req('POST', { reasonCode: 'ABUSE', isManager: true }), context);
  expect(bridge.mock.calls[0][3]).toEqual({ reasonCode: 'ABUSE' });
});
it.each(['', 'x'.repeat(1001)])('rejects invalid body length', async body => {
  expect((await POST(req('POST', { body, clientRequestId: messageId }), context)).status).toBe(400);
  expect(bridge).not.toHaveBeenCalled();
});
it('preserves server authorization failure', async () => {
  bridge.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' });
  expect((await reports(req(), context)).status).toBe(403);
});
