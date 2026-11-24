import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from '@/lib/java-bridge';
import { assertSameOrigin, getSessionId, isValidUuid, readJsonBody, toNextResponse } from '@/lib/route-helpers';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; holdId: string }> }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const { id, holdId } = await context.params;
  if (!isValidUuid(id) || !isValidUuid(holdId)) return NextResponse.json({ error: 'Mã tài nguyên không hợp lệ.' }, { status: 400 });
  const body = await readJsonBody<{ durationMinutes: number; handoverMode: string }>(request);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Dữ liệu yêu cầu không hợp lệ.' }, { status: 400 });
  if (!Number.isInteger(body.durationMinutes) || body.durationMinutes < 1 || body.durationMinutes > 360 || !['SELF_PICKUP', 'ALLOW_TRANSFER'].includes(body.handoverMode))
    return NextResponse.json({ error: 'Chọn 1–360 phút và chế độ bàn giao hợp lệ.' }, { status: 400 });
  const result = await callJavaWithSession(getSessionId(request), 'POST', `/api/buildings/${id}/holds/${holdId}/start`, body);
  const response = toNextResponse(result);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
