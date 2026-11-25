import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from '@/lib/java-bridge';
import { assertSameOrigin, getSessionId, isValidUuid, readJsonBody, toNextResponse } from '@/lib/route-helpers';
export async function POST(request: NextRequest, context: { params: Promise<{ id: string; messageId: string }> }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const { id, messageId } = await context.params;
  const body = await readJsonBody<{ reasonCode?: string }>(request);
  if (!isValidUuid(id) || !isValidUuid(messageId) || !body || !['SPAM', 'ABUSE', 'OTHER'].includes(body.reasonCode ?? ''))
    return NextResponse.json({ error: 'Yêu cầu ẩn không hợp lệ.' }, { status: 400 });
  return toNextResponse(await callJavaWithSession(getSessionId(request), 'POST', `/api/buildings/${id}/chat/messages/${messageId}/hide`, { reasonCode: body.reasonCode }));
}
