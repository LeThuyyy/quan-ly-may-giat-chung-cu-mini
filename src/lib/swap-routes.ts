import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from './java-bridge';
import { assertSameOrigin, getSessionId, isValidUuid, readJsonBody, toNextResponse } from './route-helpers';

function output(result: Parameters<typeof toNextResponse>[0]) {
  const response = toNextResponse(result); response.headers.set('Cache-Control', 'private, no-store'); return response;
}
export async function listSwaps(request: NextRequest, id: string, kind: 'history' | 'pending' | 'outgoing' = 'history') {
  if (!isValidUuid(id)) return NextResponse.json({ error: 'Mã tòa không hợp lệ.' }, { status: 400 });
  const query = request.nextUrl.searchParams;
  const page = query.get('page') ?? '0', size = query.get('size') ?? '50';
  if ([...query.keys()].some(key => !['page', 'size'].includes(key) || query.getAll(key).length !== 1)
    || !/^\d+$/.test(page) || !/^\d+$/.test(size) || Number(page) > 10000 || Number(size) < 1 || Number(size) > 50) {
    return NextResponse.json({ error: 'Phân trang không hợp lệ.' }, { status: 400 });
  }
  const suffix = kind === 'history' ? '' : `/${kind}`;
  return output(await callJavaWithSession(getSessionId(request), 'GET',
    `/api/buildings/${id}/swaps${suffix}${kind === 'outgoing' ? '' : `?page=${Number(page)}&size=${Number(size)}`}`));
}
export async function changeSwap(request: NextRequest, id: string, action: 'create' | 'accept' | 'reject' | 'cancel', swapId?: string) {
  const origin = assertSameOrigin(request); if (origin) return origin;
  if (!isValidUuid(id) || (action !== 'create' && (!swapId || !isValidUuid(swapId)))) return NextResponse.json({ error: 'Mã tài nguyên không hợp lệ.' }, { status: 400 });
  if (action === 'create') {
    const body = await readJsonBody<{ recipientEntryId?: unknown }>(request);
    if (typeof body?.recipientEntryId !== 'string' || !isValidUuid(body.recipientEntryId)) return NextResponse.json({ error: 'Mã lượt người nhận không hợp lệ.' }, { status: 400 });
    return output(await callJavaWithSession(getSessionId(request), 'POST', `/api/buildings/${id}/swaps`, { recipientEntryId: body.recipientEntryId }));
  }
  return output(await callJavaWithSession(getSessionId(request), 'POST', `/api/buildings/${id}/swaps/${swapId}/${action}`));
}
