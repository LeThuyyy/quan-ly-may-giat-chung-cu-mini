import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUuid } from '../random-uuid';

afterEach(() => vi.unstubAllGlobals());
describe('secure UUID creation', () => {
  it('uses native randomUUID where available', () => {
    const native = vi.fn(() => '11111111-1111-4111-8111-111111111111');
    vi.stubGlobal('crypto', { randomUUID: native });
    expect(randomUuid()).toBe('11111111-1111-4111-8111-111111111111');
    expect(native).toHaveBeenCalledOnce();
  });
  it('uses getRandomValues on HTTP LAN without randomUUID', () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => { bytes.fill(255); return bytes; });
    vi.stubGlobal('crypto', { getRandomValues });
    expect(randomUuid()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(getRandomValues).toHaveBeenCalledOnce();
  });
});
