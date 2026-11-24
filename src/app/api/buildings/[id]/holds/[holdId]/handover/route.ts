import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from '@/lib/java-bridge';
import { getSessionId, isValidUuid, toNextResponse } from '@/lib/route-helpers';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; holdId: string }> }) {
  const { id, holdId } = await context.params;
  if (!isValidUuid(id) || !isValidUuid(holdId)) return NextResponse.json({ error: 'Mã tài nguyên không hợp lệ.' }, { status: 400 });
  const result = await callJavaWithSession(getSessionId(request), 'GET', `/api/buildings/${id}/holds/${holdId}/handover`);
  const response = toNextResponse(result);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
