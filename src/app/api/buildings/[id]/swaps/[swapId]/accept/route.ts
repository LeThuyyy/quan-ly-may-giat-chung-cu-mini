import { NextRequest } from 'next/server';
import { changeSwap } from '@/lib/swap-routes';
export async function POST(request: NextRequest, context: { params: Promise<{ id: string; swapId: string }> }) {
  const { id, swapId } = await context.params; return changeSwap(request, id, 'accept', swapId);
}
