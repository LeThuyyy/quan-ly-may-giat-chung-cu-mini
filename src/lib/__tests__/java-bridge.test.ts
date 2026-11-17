import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  callJavaWithSession,
  getJavaLoopbackOrigin,
  loginJavaAccount,
  logoutJavaAccount,
} from '../java-bridge';
import { getOpaqueSession } from '../session-store';

describe('java-bridge security', () => {
  const originalEnv = process.env.JAVA_API_ORIGIN;

  afterEach(() => {
    process.env.JAVA_API_ORIGIN = originalEnv;
    vi.restoreAllMocks();
  });

  it('rejects non-loopback JAVA_API_ORIGIN', () => {
    process.env.JAVA_API_ORIGIN = 'https://example.com:8080';
    expect(() => getJavaLoopbackOrigin()).toThrow();

    process.env.JAVA_API_ORIGIN = 'http://127.0.0.1:8080';
    expect(getJavaLoopbackOrigin()).toBe('http://127.0.0.1:8080');
  });

  it('stores opaque session, rejects redirects, and invalidates on logout', async () => {
    process.env.JAVA_API_ORIGIN = 'http://127.0.0.1:8080';

    const fetchMock = vi.fn()
      // 1. GET /api/csrf pre-login
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ headerName: 'X-CSRF-TOKEN', token: 'pre-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'JSESSIONID=java-pre; Path=/; HttpOnly' },
        }),
      )
      // 2. POST /api/auth/login
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'u1', username: 'alice', displayName: 'Alice' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'JSESSIONID=java-auth; Path=/; HttpOnly' },
        }),
      )
      // 3. GET /api/csrf post-login
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ headerName: 'X-CSRF-TOKEN', token: 'post-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      // 4. Unexpected 302 redirect from Java
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'https://evil.test' } }))
      // 5. POST /api/auth/logout
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    vi.stubGlobal('fetch', fetchMock);

    const loginRes = await loginJavaAccount({ username: 'alice', password: 'strong-password-123' });
    expect(loginRes.ok).toBe(true);
    expect(loginRes.data?.sessionId).toMatch(/^[0-9a-f]{64}$/);
    expect(loginRes.data?.sessionId).not.toContain('java-auth');

    const stored = getOpaqueSession(loginRes.data!.sessionId);
    expect(stored?.javaCookie).toBe('JSESSIONID=java-auth');
    expect(stored?.csrfToken).toBe('post-token');

    const redirectRes = await callJavaWithSession(loginRes.data!.sessionId, 'GET', '/api/buildings');
    expect(redirectRes.ok).toBe(false);
    expect(redirectRes.status).toBe(502);

    const logoutRes = await logoutJavaAccount(loginRes.data!.sessionId);
    expect(logoutRes.ok).toBe(true);
    expect(logoutRes.clearSessionCookie).toBe(true);
    expect(getOpaqueSession(loginRes.data!.sessionId)).toBeNull();
  });
});
