import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { callJavaWithSession } from '../java-bridge';
import { POST as start } from '../../app/api/buildings/[id]/holds/[holdId]/start/route';
import { POST as reportRunning } from '../../app/api/buildings/[id]/holds/[holdId]/report-running/route';
import { POST as transfer } from '../../app/api/buildings/[id]/wash-cycles/[cycleId]/transfer/route';
import { POST as remaining } from '../../app/api/buildings/[id]/wash-cycles/[cycleId]/remaining/route';
import { POST as pickup } from '../../app/api/buildings/[id]/wash-cycles/[cycleId]/pickup/route';
import { GET as mine } from '../../app/api/buildings/[id]/wash-cycles/me/route';
import { GET as issues } from '../../app/api/buildings/[id]/wash-cycles/issues/route';

vi.mock('../java-bridge', () => ({ callJavaWithSession: vi.fn() }));
const bridge = vi.mocked(callJavaWithSession);
const id = '11111111-1111-4111-8111-111111111111';
const holdId = '22222222-2222-4222-8222-222222222222';
const cycleId = '33333333-3333-4333-8333-333333333333';
const sessionId = 'a'.repeat(64);
function request(path: string, method: string, body?: unknown, origin = 'http://localhost:3000') {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: { Host: 'localhost:3000', Origin: origin, Cookie: `laundry_session=${sessionId}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}
beforeEach(() => { vi.resetAllMocks(); bridge.mockResolvedValue({ ok: true, status: 200, data: { id: cycleId } }); });

describe('B reuses A single start endpoint', () => {
  const path = `/api/buildings/${id}/holds/${holdId}/start`;
  const params = { params: Promise.resolve({ id, holdId }) };
  it('forwards only validated form fields as POST to existing /start', async () => {
    const data = { durationMinutes: 48, handoverMode: 'SELF_PICKUP' };
    const res = await start(request(path, 'POST', data), params);
    expect(res.status).toBe(200);
    expect(bridge).toHaveBeenCalledWith(sessionId, 'POST', path, data);
  });
  it.each([0, 361, 12.5])('rejects bad duration %s', async (durationMinutes) => {
    const res = await start(request(path, 'POST', { durationMinutes, handoverMode: 'ALLOW_TRANSFER' }), params);
    expect(res.status).toBe(400); expect(bridge).not.toHaveBeenCalled();
  });
  it('rejects wrong mode, malformed IDs and cross origin', async () => {
    expect((await start(request(path, 'POST', { durationMinutes: 30, handoverMode: 'WRONG' }), params)).status).toBe(400);
    expect((await start(request(path, 'POST', { durationMinutes: 30, handoverMode: 'SELF_PICKUP' }, 'https://evil.test'), params)).status).toBe(403);
    expect((await start(request(path, 'POST', { durationMinutes: 30, handoverMode: 'SELF_PICKUP' }), { params: Promise.resolve({ id: 'bad', holdId }) })).status).toBe(400);
    expect(bridge).not.toHaveBeenCalled();
  });
  it('keeps 409 instead of presenting start success', async () => {
    bridge.mockResolvedValue({ ok: false, status: 409, error: 'Lượt đã hết hạn' });
    const res = await start(request(path, 'POST', { durationMinutes: 30, handoverMode: 'ALLOW_TRANSFER' }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Lượt đã hết hạn' });
  });
});

describe('owner remaining-time idempotency route', () => {
  const path = `/api/buildings/${id}/wash-cycles/${cycleId}/remaining`;
  const params = { params: Promise.resolve({ id, cycleId }) };
  it('forwards an operation UUID and minutes, not client authority', async () => {
    const response = await remaining(request(path, 'POST', { remainingMinutes: 12, clientRequestId: holdId, accountId: 'other' }), params);
    expect(response.status).toBe(200);
    expect(bridge).toHaveBeenCalledWith(sessionId, 'POST', path, { remainingMinutes: 12, clientRequestId: holdId });
  });
  it('rejects invalid operation IDs before Java', async () => {
    expect((await remaining(request(path, 'POST', { remainingMinutes: 12, clientRequestId: 'bad' }), params)).status).toBe(400);
    expect(bridge).not.toHaveBeenCalled();
  });
  it('preserves legacy requests without operation ID', async () => {
    await remaining(request(path, 'POST', { remainingMinutes: 12 }), params);
    expect(bridge).toHaveBeenCalledWith(sessionId, 'POST', path, { remainingMinutes: 12 });
  });
});

describe('B handover and report-running', () => {
  it('forwards report with remaining minutes', async () => {
    const path = `/api/buildings/${id}/holds/${holdId}/report-running`;
    const res = await reportRunning(request(path, 'POST', { remainingMinutes: 12 }), { params: Promise.resolve({ id, holdId }) });
    expect(res.status).toBe(200);
    expect(bridge).toHaveBeenCalledWith(sessionId, 'POST', path, { remainingMinutes: 12 });
  });
  it('requires physically confirmed transfer and matching hold id', async () => {
    const path = `/api/buildings/${id}/wash-cycles/${cycleId}/transfer`;
    const params = { params: Promise.resolve({ id, cycleId }) };
    expect((await transfer(request(path, 'POST', { physicallyConfirmed: false, holdId }), params)).status).toBe(400);
    expect(bridge).not.toHaveBeenCalled();
    expect((await transfer(request(path, 'POST', { physicallyConfirmed: true, holdId }), params)).status).toBe(200);
  });
  it('requires physical pickup confirmation', async () => {
    const path = `/api/buildings/${id}/wash-cycles/${cycleId}/pickup`;
    const params = { params: Promise.resolve({ id, cycleId }) };
    expect((await pickup(request(path, 'POST', { physicallyConfirmed: false }), params)).status).toBe(400);
    expect((await pickup(request(path, 'POST', { physicallyConfirmed: true }), params)).status).toBe(200);
  });
  it('returns private no-store views and preserves error statuses', async () => {
    const path = `/api/buildings/${id}/wash-cycles/me`;
    bridge.mockResolvedValue({ ok: true, status: 200, data: [] });
    const res = await mine(request(path, 'GET'), { params: Promise.resolve({ id }) });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(bridge).toHaveBeenCalledWith(sessionId, 'GET', path);
    bridge.mockResolvedValue({ ok: false, status: 403, error: 'Cần quyền quản lý' });
    const denied = await issues(request(`/api/buildings/${id}/wash-cycles/issues`, 'GET'), { params: Promise.resolve({ id }) });
    expect(denied.status).toBe(403);
  });
});
