import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from '@/lib/java-bridge';
import { assertSameOrigin, getSessionId, isValidUuid, readJsonBody, toNextResponse } from '@/lib/route-helpers';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; cycleId: string }> }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const { id, cycleId } = await context.params;
  if (!isValidUuid(id) || !isValidUuid(cycleId)) return NextResponse.json({ error: 'Mã tài nguyên không hợp lệ.' }, { status: 400 });
  const body = await readJsonBody<{ action: string; remainingMinutes?: number; physicallyConfirmed: boolean }>(request);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Dữ liệu yêu cầu không hợp lệ.' }, { status: 400 });
  if (!['CLEARED', 'DEFER', 'MAINTENANCE'].includes(body.action)) return NextResponse.json({ error: 'Hành động không hợp lệ.' }, { status: 400 });
  const result = await callJavaWithSession(getSessionId(request), 'POST', `/api/buildings/${id}/wash-cycles/${cycleId}/resolve`, body);
  const response = toNextResponse(result);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
