import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from '@/lib/java-bridge';
import { getSessionId, isValidUuid, toNextResponse } from '@/lib/route-helpers';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const query = request.nextUrl.searchParams;
  const page = query.get('page') ?? '0';
  const size = query.get('size') ?? '20';
  let response: NextResponse;
  if (!isValidUuid(id) || [...query.keys()].some((key) => !['page', 'size'].includes(key)) ||
      [...query.keys()].some((key) => query.getAll(key).length !== 1) ||
      !/^\d+$/.test(page) || !Number.isSafeInteger(Number(page)) ||
      !/^\d+$/.test(size) || Number(size) < 1 || Number(size) > 50) {
    response = NextResponse.json({ error: 'Mã tòa hoặc phân trang không hợp lệ.' }, { status: 400 });
  } else {
    response = toNextResponse(await callJavaWithSession(getSessionId(request), 'GET', `/api/buildings/${id}/members/removed?page=${Number(page)}&size=${Number(size)}`));
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
