import { NextRequest } from 'next/server';
import { listSwaps, changeSwap } from '@/lib/swap-routes';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) { return listSwaps(request, (await context.params).id); }
export async function POST(request: NextRequest, context: Context) { return changeSwap(request, (await context.params).id, 'create'); }
