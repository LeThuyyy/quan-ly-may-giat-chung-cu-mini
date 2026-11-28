import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from './java-bridge';
import { assertSameOrigin, getSessionId, readJsonBody, toNextResponse } from './route-helpers';

/** Thin validation only: ownership, supported endpoints and key validation belong to Java. */
export async function pushMutation(request: NextRequest, method: 'POST' | 'DELETE', statusOnly = false) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const body = await readJsonBody<{ endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }>(request);
  if (!body || typeof body.endpoint !== 'string' || body.endpoint.length > 2048 || !body.endpoint) {
    return NextResponse.json({ error: 'Địa chỉ nhận thông báo không hợp lệ.' }, { status: 400 });
  }
  const payload: Record<string, unknown> = { endpoint: body.endpoint };
  if (method === 'POST' && !statusOnly) {
    if (typeof body.keys?.p256dh !== 'string' || typeof body.keys.auth !== 'string'
      || body.keys.p256dh.length > 128 || body.keys.auth.length > 64) {
      return NextResponse.json({ error: 'Khóa nhận thông báo không hợp lệ.' }, { status: 400 });
    }
    payload.keys = { p256dh: body.keys.p256dh, auth: body.keys.auth };
  }
  const path = `/api/push/subscriptions${statusOnly ? '/status' : ''}`;
  const response = toNextResponse(await callJavaWithSession(getSessionId(request), method, path, payload));
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
