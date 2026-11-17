import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from '@/lib/java-bridge';
import { assertSameOrigin, getSessionId, isValidUuid, toNextResponse } from '@/lib/route-helpers';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; accountId: string }> },
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { id, accountId } = await context.params;
  if (!isValidUuid(id) || !isValidUuid(accountId)) {
    return NextResponse.json({ error: 'Mã tòa hoặc mã tài khoản không hợp lệ.' }, { status: 400 });
  }

  const result = await callJavaWithSession(
    getSessionId(request),
    'POST',
    `/api/buildings/${id}/members/${accountId}/approve`,
  );
  return toNextResponse(result);
}
