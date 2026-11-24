import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from '@/lib/java-bridge';
import { assertSameOrigin, getSessionId, isValidUuid, readJsonBody, toNextResponse } from '@/lib/route-helpers';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; cycleId: string }> }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const { id, cycleId } = await context.params;
  if (!isValidUuid(id) || !isValidUuid(cycleId)) return NextResponse.json({ error: 'Mã tài nguyên không hợp lệ.' }, { status: 400 });
  const body = await readJsonBody<{ remainingMinutes: number | null }>(request);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Dữ liệu yêu cầu không hợp lệ.' }, { status: 400 });
  if (body.remainingMinutes !== null && (!Number.isInteger(body.remainingMinutes) || body.remainingMinutes < 1 || body.remainingMinutes > 360)) return NextResponse.json({ error: 'Số phút còn lại không hợp lệ.' }, { status: 400 });
  const result = await callJavaWithSession(getSessionId(request), 'POST', `/api/buildings/${id}/wash-cycles/${cycleId}/remaining`, body);
  const response = toNextResponse(result);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
