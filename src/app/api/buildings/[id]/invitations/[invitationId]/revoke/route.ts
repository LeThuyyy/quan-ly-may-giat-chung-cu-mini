import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from '@/lib/java-bridge';
import { assertSameOrigin, getSessionId, isValidUuid, toNextResponse } from '@/lib/route-helpers';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; invitationId: string }> }) {
  let response = assertSameOrigin(request);
  if (!response) {
    const { id, invitationId } = await context.params;
    response = !isValidUuid(id) || !isValidUuid(invitationId)
      ? NextResponse.json({ error: 'Mã tòa hoặc lời mời không hợp lệ.' }, { status: 400 })
      : toNextResponse(await callJavaWithSession(getSessionId(request), 'POST', `/api/buildings/${id}/invitations/${invitationId}/revoke`));
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
