import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from '@/lib/java-bridge';
import { assertSameOrigin, getSessionId, isValidUuid, toNextResponse } from '@/lib/route-helpers';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; holdId: string }> }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const { id, holdId } = await context.params;
  if (!isValidUuid(id) || !isValidUuid(holdId)) {
    return NextResponse.json({ error: 'Mã tòa hoặc lượt giữ không hợp lệ.' }, { status: 400 });
  }
  return toNextResponse(await callJavaWithSession(getSessionId(request), 'POST', `/api/buildings/${id}/holds/${holdId}/unusable`));
}
