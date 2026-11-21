import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { callJavaWithSession } from '../java-bridge';
import { GET } from '../../app/api/buildings/[id]/holds/route';
import { POST as yieldHold } from '../../app/api/buildings/[id]/holds/[holdId]/yield/route';
import { POST as confirmCheck } from '../../app/api/buildings/[id]/holds/[holdId]/confirm-check/route';
import { POST as confirmFree } from '../../app/api/buildings/[id]/machines/[machineId]/confirm-free/route';

vi.mock('../java-bridge', () => ({ callJavaWithSession: vi.fn() }));

const buildingId = '11111111-1111-4111-8111-111111111111';
const resourceId = '22222222-2222-4222-8222-222222222222';
const sessionId = 'a'.repeat(64);
const bridge = vi.mocked(callJavaWithSession);

function request(path: string, method: string, origin: string | null = 'http://localhost:3000') {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: {
      Host: 'localhost:3000',
      ...(origin === null ? {} : { Origin: origin }),
      Cookie: `laundry_session=${sessionId}`,
    },
  });
}

const mutations = [
  {
    name: 'yield',
    path: `/api/buildings/${buildingId}/holds/${resourceId}/yield`,
    invoke: (req: NextRequest, id = buildingId, child = resourceId) => yieldHold(req, {
      params: Promise.resolve({ id, holdId: child }),
    }),
  },
  {
    name: 'confirm-check',
    path: `/api/buildings/${buildingId}/holds/${resourceId}/confirm-check`,
    invoke: (req: NextRequest, id = buildingId, child = resourceId) => confirmCheck(req, {
      params: Promise.resolve({ id, holdId: child }),
    }),
  },
  {
    name: 'confirm-free',
    path: `/api/buildings/${buildingId}/machines/${resourceId}/confirm-free`,
    invoke: (req: NextRequest, id = buildingId, child = resourceId) => confirmFree(req, {
      params: Promise.resolve({ id, machineId: child }),
    }),
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  bridge.mockResolvedValue({ ok: true, status: 200 });
});

describe('allocation read route', () => {
  const path = `/api/buildings/${buildingId}/holds`;

  it('forwards the opaque session and returns hold data', async () => {
    const holds = [{ id: resourceId, expiresAt: '2026-11-21T10:08:00Z' }];
    bridge.mockResolvedValue({ ok: true, status: 200, data: holds });
    const res = await GET(request(path, 'GET'), { params: Promise.resolve({ id: buildingId }) });
    expect(bridge).toHaveBeenCalledWith(sessionId, 'GET', path);
    expect(await res.json()).toEqual(holds);
  });

  it('rejects an invalid building ID before calling Java', async () => {
    const res = await GET(request(path, 'GET'), { params: Promise.resolve({ id: 'bad' }) });
    expect(res.status).toBe(400);
    expect(bridge).not.toHaveBeenCalled();
  });

  it('clears an expired opaque cookie on Java 401', async () => {
    bridge.mockResolvedValue({ ok: false, status: 401, error: 'Phiên đã hết hạn.', clearSessionCookie: true });
    const res = await GET(request(path, 'GET'), { params: Promise.resolve({ id: buildingId }) });
    expect(res.status).toBe(401);
    expect(res.cookies.get('laundry_session')?.value).toBe('');
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});

for (const mutation of mutations) {
  describe(`allocation ${mutation.name} route`, () => {
    it('forwards only the validated resource path with the session', async () => {
      const res = await mutation.invoke(request(mutation.path, 'POST'));
      expect(res.status).toBe(200);
      expect(bridge).toHaveBeenCalledWith(sessionId, 'POST', mutation.path);
    });

    it.each([null, 'https://other.example', 'https://localhost:3000'])('rejects unsafe origin %s', async (origin) => {
      const res = await mutation.invoke(request(mutation.path, 'POST', origin));
      expect(res.status).toBe(403);
      expect(bridge).not.toHaveBeenCalled();
    });

    it.each([
      ['bad', resourceId],
      [buildingId, 'bad'],
    ])('rejects invalid IDs %s / %s', async (id, child) => {
      const res = await mutation.invoke(request(mutation.path, 'POST'), id, child);
      expect(res.status).toBe(400);
      expect(bridge).not.toHaveBeenCalled();
    });

    it('preserves a backend conflict without claiming success', async () => {
      bridge.mockResolvedValue({ ok: false, status: 409, error: 'Lượt giữ đã kết thúc.' });
      const res = await mutation.invoke(request(mutation.path, 'POST'));
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'Lượt giữ đã kết thúc.' });
    });
  });
}
