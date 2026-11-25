import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from '@/lib/java-bridge';
import { getSessionId, isValidUuid, toNextResponse } from '@/lib/route-helpers';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const query = request.nextUrl.searchParams;
  const page = query.get('page') ?? '0';
  const size = query.get('size') ?? '20';
  const type = query.get('type') ?? '';
  const machineId = query.get('machineId') ?? '';
  let response: NextResponse;
  if (!isValidUuid(id) || [...query.keys()].some((key) => !['page', 'size', 'type', 'machineId'].includes(key)) ||
      [...query.keys()].some((key) => query.getAll(key).length !== 1) ||
      !/^\d+$/.test(page) || !Number.isSafeInteger(Number(page)) ||
      !/^\d+$/.test(size) || Number(size) < 1 || Number(size) > 50 ||
      (type !== '' && !/^[A-Z_]{1,60}$/.test(type)) || (machineId !== '' && !isValidUuid(machineId))) {
    response = NextResponse.json({ error: 'Mã tòa, bộ lọc hoặc phân trang không hợp lệ.' }, { status: 400 });
  } else {
    const filters = new URLSearchParams({ page: String(Number(page)), size: String(Number(size)) });
    if (type) filters.set('type', type);
    if (machineId) filters.set('machineId', machineId);
    response = toNextResponse(await callJavaWithSession(getSessionId(request), 'GET', `/api/buildings/${id}/activity?${filters}`));
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
