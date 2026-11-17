import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from '@/lib/java-bridge';
import { assertSameOrigin, getSessionId, isValidUuid, readJsonBody, toNextResponse } from '@/lib/route-helpers';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Mã tòa không hợp lệ.' }, { status: 400 });
  }

  const body = await readJsonBody<{ ready?: boolean }>(request);
  if (!body || typeof body.ready !== 'boolean') {
    return NextResponse.json({ error: 'Trường ready phải là boolean.' }, { status: 400 });
  }

  const result = await callJavaWithSession(getSessionId(request), 'POST', `/api/buildings/${id}/queue`, {
    ready: body.ready,
  });
  return toNextResponse(result);
}
