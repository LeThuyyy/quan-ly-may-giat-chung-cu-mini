import { NextRequest, NextResponse } from 'next/server';
import { callJavaWithSession } from './java-bridge';
import { assertSameOrigin, getSessionId, isValidUuid, readJsonBody, toNextResponse } from './route-helpers';

function output(result: Parameters<typeof toNextResponse>[0]) {
  const response = toNextResponse(result); response.headers.set('Cache-Control', 'private, no-store'); return response;
}
export async function listSwaps(request: NextRequest, id: string) {
  if (!isValidUuid(id)) return NextResponse.json({ error: 'Mã tòa không hợp lệ.' }, { status: 400 });
  return output(await callJavaWithSession(getSessionId(request), 'GET', `/api/buildings/${id}/swaps?page=0&size=50`));
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
