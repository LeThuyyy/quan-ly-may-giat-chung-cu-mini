import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from '@/lib/java-bridge';
import { assertSameOrigin, getSessionId, isValidUuid, readJsonBody, toNextResponse } from '@/lib/route-helpers';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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

  const result = await callJavaWithSession(getSessionId(request), 'PATCH', `/api/buildings/${id}/queue/me`, {
    ready: body.ready,
  });
  return toNextResponse(result);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Mã tòa không hợp lệ.' }, { status: 400 });
  }

  const result = await callJavaWithSession(getSessionId(request), 'DELETE', `/api/buildings/${id}/queue/me`);
  return toNextResponse(result);
}
