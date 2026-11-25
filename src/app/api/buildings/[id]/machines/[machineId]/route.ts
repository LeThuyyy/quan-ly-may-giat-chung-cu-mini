import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from '@/lib/java-bridge';
import { assertSameOrigin, getSessionId, isValidUuid, readJsonBody, toNextResponse } from '@/lib/route-helpers';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; machineId: string }> }) {
  const { id, machineId } = await context.params;
  if (!isValidUuid(id) || !isValidUuid(machineId)) return NextResponse.json({ error: 'Mã tòa hoặc máy không hợp lệ.' }, { status: 400 });
  const response = toNextResponse(await callJavaWithSession(getSessionId(request), 'GET', `/api/buildings/${id}/machines/${machineId}`));
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; machineId: string }> },
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { id, machineId } = await context.params;
  if (!isValidUuid(id) || !isValidUuid(machineId)) {
    return NextResponse.json({ error: 'Mã tòa hoặc mã máy không hợp lệ.' }, { status: 400 });
  }

  const body = await readJsonBody<{ maintenance?: boolean }>(request);
  if (!body || typeof body.maintenance !== 'boolean') {
    return NextResponse.json({ error: 'Trường maintenance phải là boolean.' }, { status: 400 });
  }

  const result = await callJavaWithSession(
    getSessionId(request),
    'PATCH',
    `/api/buildings/${id}/machines/${machineId}`,
    { maintenance: body.maintenance },
  );
  return toNextResponse(result);
}
