import { NextRequest } from 'next/server';
import { pushMutation } from '@/lib/push-routes';

export function POST(request: NextRequest) { return pushMutation(request, 'POST'); }
export function DELETE(request: NextRequest) { return pushMutation(request, 'DELETE'); }
