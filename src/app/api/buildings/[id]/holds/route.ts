import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from '@/lib/java-bridge';
import { getSessionId, isValidUuid, toNextResponse } from '@/lib/route-helpers';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Mã tòa không hợp lệ.' }, { status: 400 });
  }
  return toNextResponse(await callJavaWithSession(getSessionId(request), 'GET', `/api/buildings/${id}/holds`));
}
