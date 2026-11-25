import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from '@/lib/java-bridge';
import { getSessionId, isValidUuid, toNextResponse } from '@/lib/route-helpers';
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const page = request.nextUrl.searchParams.get('page') ?? '0';
  const size = request.nextUrl.searchParams.get('size') ?? '30';
  if (!isValidUuid(id) || !/^\d+$/.test(page) || Number(page) > 10000 || !/^\d+$/.test(size) || Number(size) < 1 || Number(size) > 50)
    return NextResponse.json({ error: 'Trang không hợp lệ.' }, { status: 400 });
  return toNextResponse(await callJavaWithSession(getSessionId(request), 'GET', `/api/buildings/${id}/chat/reports?page=${Number(page)}&size=${Number(size)}`));
}
