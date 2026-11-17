import { NextRequest } from 'next/server';
import { callJavaWithSession } from '@/lib/java-bridge';
import { getSessionId, toNextResponse } from '@/lib/route-helpers';

export async function GET(request: NextRequest) {
  const result = await callJavaWithSession(getSessionId(request), 'GET', '/api/me');
  return toNextResponse(result);
}
