import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from '@/lib/java-bridge';
import { assertSameOrigin, getSessionId, isValidInviteToken, toNextResponse } from '@/lib/route-helpers';

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { token } = await context.params;
  if (!isValidInviteToken(token)) {
    return NextResponse.json({ error: 'Mã lời mời không hợp lệ.' }, { status: 400 });
  }

  const result = await callJavaWithSession(getSessionId(request), 'POST', `/api/invitations/${token}/join`);
  return toNextResponse(result);
}
