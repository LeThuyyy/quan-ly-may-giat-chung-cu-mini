import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { callJavaWithSession } from '../java-bridge';
import { GET as eta } from '../../app/api/buildings/[id]/eta/me/route';
import { GET as detail } from '../../app/api/buildings/[id]/machines/[machineId]/route';
import { GET as qr } from '../../app/api/buildings/[id]/machines/[machineId]/qr/route';
vi.mock('../java-bridge', () => ({ callJavaWithSession: vi.fn() }));
const bridge = vi.mocked(callJavaWithSession);
const id = '11111111-1111-4111-8111-111111111111';
const machineId = '22222222-2222-4222-8222-222222222222';
const context = () => ({ params: Promise.resolve({ id, machineId }) });
const request = () => new NextRequest('http://localhost:3000/api?accountId=untrusted', { headers: { Cookie: 'laundry_session=session' } });
beforeEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
it('forwards ETA through session without account query and disables cache', async () => {
  bridge.mockResolvedValue({ ok: true, status: 200, data: { state: 'UNREADY' } });
  const response = await eta(request(), context());
  expect(bridge).toHaveBeenCalledWith('session', 'GET', `/api/buildings/${id}/eta/me`);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(await response.json()).toEqual({ state: 'UNREADY' });
});
it('validates both machine IDs before bridge access', async () => {
  const response = await detail(request(), { params: Promise.resolve({ id, machineId: 'bad' }) });
  expect(response.status).toBe(400); expect(bridge).not.toHaveBeenCalled();
});
it('authorizes detail before QR generation and preserves expired session clearing', async () => {
  bridge.mockResolvedValue({ ok: false, status: 401, clearSessionCookie: true });
  const response = await qr(request(), context());
  expect(response.status).toBe(401); expect(response.cookies.get('laundry_session')?.value).toBe('');
});
it('generates local SVG without trusting Host or a return URL', async () => {
  bridge.mockResolvedValue({ ok: true, status: 200, data: {} });
  vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
  const response = await qr(request(), context());
  expect(response.status).toBe(200); expect(response.headers.get('content-type')).toBe('image/svg+xml');
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(await response.text()).toContain('<svg');
});
it.each(['https://user:password@example.com', 'https://example.com/path', 'javascript:alert(1)'])('rejects unsafe configured origin %s', async origin => {
  bridge.mockResolvedValue({ ok: true, status: 200, data: {} }); vi.stubEnv('APP_ORIGIN', origin);
  expect((await qr(request(), context())).status).toBe(503);
});
