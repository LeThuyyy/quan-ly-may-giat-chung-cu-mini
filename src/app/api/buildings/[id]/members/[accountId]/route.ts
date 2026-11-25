import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from '@/lib/java-bridge';
import { assertSameOrigin, getSessionId, isValidUuid, toNextResponse } from '@/lib/route-helpers';

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; accountId: string }> }) {
  let response = assertSameOrigin(request);
  if (!response) {
    const { id, accountId } = await context.params;
    response = !isValidUuid(id) || !isValidUuid(accountId)
      ? NextResponse.json({ error: 'Mã tòa hoặc tài khoản không hợp lệ.' }, { status: 400 })
      : toNextResponse(await callJavaWithSession(getSessionId(request), 'DELETE', `/api/buildings/${id}/members/${accountId}`));
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
