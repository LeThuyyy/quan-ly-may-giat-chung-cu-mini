import { NextRequest, NextResponse } from 'next/server';
import { loginJavaAccount } from '@/lib/java-bridge';
import { assertSameOrigin, readJsonBody, toNextResponse } from '@/lib/route-helpers';
import { buildSessionCookie } from '@/lib/session-store';

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const body = await readJsonBody<{ username?: string; password?: string }>(request);
  if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu.' }, { status: 400 });
  }

  const result = await loginJavaAccount({
    username: body.username,
    password: body.password,
  });

  if (!result.ok || !result.data) {
    return toNextResponse(result);
  }

  const response = NextResponse.json(result.data.account, { status: 200 });
  response.cookies.set(buildSessionCookie(result.data.sessionId, 60 * 60 * 12));
  return response;
}
