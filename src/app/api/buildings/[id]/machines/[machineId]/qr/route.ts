import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { callJavaWithSession } from '@/lib/java-bridge';
import { getSessionId, isValidUuid, toNextResponse } from '@/lib/route-helpers';

function canonicalOrigin(value: string | undefined): string {
  const url = new URL(value ?? 'http://localhost:3000');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('APP_ORIGIN must be a trusted HTTP(S) origin only');
  }
  return url.origin;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; machineId: string }> }) {
  const { id, machineId } = await context.params;
  if (!isValidUuid(id) || !isValidUuid(machineId)) return NextResponse.json({ error: 'Mã tòa hoặc máy không hợp lệ.' }, { status: 400 });
  const result = await callJavaWithSession(getSessionId(request), 'GET', `/api/buildings/${id}/machines/${machineId}`);
  if (!result.ok) {
    const response = toNextResponse(result);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
  try {
    const target = `${canonicalOrigin(process.env.APP_ORIGIN)}/buildings/${id.toLowerCase()}/machines/${machineId.toLowerCase()}`;
    const svg = await QRCode.toString(target, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 320 });
    return new NextResponse(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline; filename="machine-qr.svg"' } });
  } catch {
    return NextResponse.json({ error: 'Cấu hình địa chỉ QR không hợp lệ.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
