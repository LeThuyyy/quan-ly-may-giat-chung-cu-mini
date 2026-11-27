import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiJson } from '../api-json';
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('handles a response body read failure instead of leaking a rejected effect', async () => {
  fetchMock.mockResolvedValue({ status: 200, ok: true, text: async () => { throw new TypeError('body failed'); } } as unknown as Response);
  expect((await apiJson('/test')).ok).toBe(false);
});
it('keeps the timeout active after headers arrive and when an external signal is supplied', async () => {
  vi.useFakeTimers(); let signal!: AbortSignal;
  fetchMock.mockImplementation(async (_, init) => {
    signal = init!.signal!;
    return { status: 200, ok: true, text: () => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))) } as unknown as Response;
  });
  const external = new AbortController(); const result = apiJson('/test', { signal: external.signal });
  await Promise.resolve(); await vi.advanceTimersByTimeAsync(15000);
  expect(signal.aborted).toBe(true); expect(external.signal.aborted).toBe(false);
  expect((await result).status).toBe(504); expect(vi.getTimerCount()).toBe(0);
});
it('preserves explicit external cancellation', async () => {
  fetchMock.mockImplementation((_, init) => new Promise((_, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted')))));
  const controller = new AbortController(); const pending = apiJson('/test', { signal: controller.signal }); controller.abort();
  expect((await pending).status).toBe(504);
});
it('accepts successful empty mutation responses but rejects non-JSON successful reads', async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 })).mockResolvedValueOnce(new Response('<html>not json</html>', { status: 200 }));
  expect(await apiJson('/test', { method: 'POST' })).toEqual({ ok: true, status: 200 });
  expect((await apiJson('/test')).status).toBe(502);
});
