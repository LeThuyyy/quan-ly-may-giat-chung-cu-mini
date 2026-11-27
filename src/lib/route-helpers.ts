import { NextRequest, NextResponse } from 'next/server';
import type { BridgeResult } from './java-bridge';
import { SESSION_COOKIE_NAME, buildSessionCookie } from './session-store';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVITE_TOKEN_RE = /^[0-9a-f]{64}$/;

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function isValidInviteToken(value: string): boolean {
  return INVITE_TOKEN_RE.test(value);
}

export function getSessionId(request: NextRequest): string | undefined {
  return request.cookies.get(SESSION_COOKIE_NAME)?.value;
}

export function assertSameOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) {
    return NextResponse.json({ error: 'Yêu cầu thiếu Origin hoặc Host.' }, { status: 403 });
  }
  try {
    const parsed = new URL(origin);
    const forwardedProto = request.headers
      .get('x-forwarded-proto')
      ?.split(',')[0]
      ?.trim()
      .toLowerCase();
    const forwardedHost = request.headers
      .get('x-forwarded-host')
      ?.split(',')[0]
      ?.trim();
    const expectedHost = forwardedHost || host;
    const expectedProto =
      process.env.COOKIE_SECURE === 'true' && forwardedProto === 'https'
        ? 'https:'
        : request.nextUrl.protocol;
    const expectedOrigin = `${expectedProto}//${expectedHost}`;

    if (parsed.origin !== origin || parsed.origin !== expectedOrigin || parsed.host !== expectedHost) {
      return NextResponse.json({ error: 'Yêu cầu khác nguồn không được phép.' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Origin không hợp lệ.' }, { status: 403 });
  }
  return null;
}

export async function readJsonBody<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function toNextResponse(result: BridgeResult): NextResponse {
  if (!result.ok) {
    const res = NextResponse.json(
      { error: result.error ?? 'Không thể hoàn tất yêu cầu.' },
      { status: result.status },
    );
    if (result.clearSessionCookie) {
      res.cookies.set(buildSessionCookie('', 0));
    }
    return res;
  }

  if (result.status === 204 || result.data === undefined) {
    const res = new NextResponse(null, { status: result.status === 204 ? 204 : 200 });
    if (result.clearSessionCookie) {
      res.cookies.set(buildSessionCookie('', 0));
    }
    return res;
  }

  return NextResponse.json(result.data, { status: result.status });
}
