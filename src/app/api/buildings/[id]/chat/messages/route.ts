import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from '@/lib/java-bridge';
import { assertSameOrigin, getSessionId, isValidUuid, readJsonBody, toNextResponse } from '@/lib/route-helpers';

type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const page = request.nextUrl.searchParams.get('page') ?? '0';
  const size = request.nextUrl.searchParams.get('size') ?? '30';
  if (!isValidUuid(id) || !/^\d+$/.test(page) || Number(page) > 10000 || !/^\d+$/.test(size) || Number(size) < 1 || Number(size) > 50)
    return NextResponse.json({ error: 'Trang không hợp lệ.' }, { status: 400 });
  return toNextResponse(await callJavaWithSession(getSessionId(request), 'GET', `/api/buildings/${id}/chat/messages?page=${Number(page)}&size=${Number(size)}`));
}
export async function POST(request: NextRequest, context: Context) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const { id } = await context.params;
  const body = await readJsonBody<{ clientRequestId?: string; body?: string }>(request);
  if (!isValidUuid(id) || !body || typeof body.clientRequestId !== 'string' || !isValidUuid(body.clientRequestId) || typeof body.body !== 'string' || !body.body.trim() || body.body.trim().length > 1000)
    return NextResponse.json({ error: 'Tin nhắn không hợp lệ.' }, { status: 400 });
  return toNextResponse(await callJavaWithSession(getSessionId(request), 'POST', `/api/buildings/${id}/chat/messages`, { clientRequestId: body.clientRequestId, body: body.body.trim() }));
}
