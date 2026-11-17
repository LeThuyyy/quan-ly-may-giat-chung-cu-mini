import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from '@/lib/java-bridge';
import { assertSameOrigin, getSessionId, readJsonBody, toNextResponse } from '@/lib/route-helpers';

export async function GET(request: NextRequest) {
  const result = await callJavaWithSession(getSessionId(request), 'GET', '/api/buildings');
  return toNextResponse(result);
}

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const body = await readJsonBody<{ name?: string; machineCount?: number }>(request);
  if (!body || typeof body.name !== 'string' || typeof body.machineCount !== 'number') {
    return NextResponse.json({ error: 'Vui lòng nhập tên tòa và số máy (1–30).' }, { status: 400 });
  }

  const result = await callJavaWithSession(getSessionId(request), 'POST', '/api/buildings', {
    name: body.name,
    machineCount: body.machineCount,
  });
  return toNextResponse(result);
}
