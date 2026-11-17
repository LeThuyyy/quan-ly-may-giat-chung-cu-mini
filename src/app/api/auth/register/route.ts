import { NextRequest, NextResponse } from 'next/server';
import { registerJavaAccount } from '@/lib/java-bridge';
import { assertSameOrigin, readJsonBody, toNextResponse } from '@/lib/route-helpers';

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const body = await readJsonBody<{ username?: string; displayName?: string; password?: string }>(request);
  if (!body || typeof body.username !== 'string' || typeof body.displayName !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ error: 'Vui lòng nhập đầy đủ tên đăng nhập, tên hiển thị và mật khẩu.' }, { status: 400 });
  }

  const result = await registerJavaAccount({
    username: body.username,
    displayName: body.displayName,
    password: body.password,
  });
  return toNextResponse(result);
}
