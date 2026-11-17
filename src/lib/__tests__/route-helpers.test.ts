import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { assertSameOrigin } from '../route-helpers';

const target = 'http://localhost:3000/api/buildings';
function request(headers: Record<string, string>) {
  return new NextRequest(target, { method: 'POST', headers });
}

describe('assertSameOrigin', () => {
  it('rejects missing Origin or Host', () => {
    expect(assertSameOrigin(request({ Host: 'localhost:3000' }))?.status).toBe(403);
    expect(assertSameOrigin(request({ Origin: 'http://localhost:3000' }))?.status).toBe(403);
    expect(assertSameOrigin(request({}))?.status).toBe(403);
  });

  it('rejects cross-origin, malformed and wrong-scheme requests', () => {
    expect(assertSameOrigin(request({ Host: 'localhost:3000', Origin: 'https://other.example' }))?.status).toBe(403);
    expect(assertSameOrigin(request({ Host: 'localhost:3000', Origin: 'null' }))?.status).toBe(403);
    expect(assertSameOrigin(request({ Host: 'localhost:3000', Origin: 'https://localhost:3000' }))?.status).toBe(403);
    expect(assertSameOrigin(request({ Host: 'localhost:3000', Origin: 'http://localhost:3000/path' }))?.status).toBe(403);
  });

  it('accepts an exact matching Origin and Host', () => {
    expect(assertSameOrigin(request({ Host: 'localhost:3000', Origin: 'http://localhost:3000' }))).toBeNull();
  });
});
