import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from '@/lib/java-bridge';
import { assertSameOrigin, getSessionId, isValidUuid, toNextResponse } from '@/lib/route-helpers';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; machineId: string }> }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const { id, machineId } = await context.params;
  if (!isValidUuid(id) || !isValidUuid(machineId)) {
    return NextResponse.json({ error: 'Mã tòa hoặc máy không hợp lệ.' }, { status: 400 });
  }
  return toNextResponse(await callJavaWithSession(getSessionId(request), 'POST', `/api/buildings/${id}/machines/${machineId}/confirm-free`));
}
