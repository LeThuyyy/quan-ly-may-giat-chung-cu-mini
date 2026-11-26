import { NextRequest } from 'next/server';
import { listSwaps } from '@/lib/swap-routes';
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return listSwaps(request, (await context.params).id, 'outgoing');
}
