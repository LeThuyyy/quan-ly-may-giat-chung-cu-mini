import { NextRequest } from 'next/server';
import { callJavaWithSession } from '@/lib/java-bridge';
import { getSessionId, toNextResponse } from '@/lib/route-helpers';

export async function GET(request: NextRequest) {
  const response = toNextResponse(await callJavaWithSession(getSessionId(request), 'GET', '/api/push/config'));
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
