import { NextRequest } from 'next/server';
import { logoutJavaAccount } from '@/lib/java-bridge';
import { assertSameOrigin, getSessionId, toNextResponse } from '@/lib/route-helpers';

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const result = await logoutJavaAccount(getSessionId(request));
  return toNextResponse(result);
}
