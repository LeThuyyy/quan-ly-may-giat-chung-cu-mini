// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SwapsView from '../swaps/SwapsView';

const fetchMock = vi.fn<typeof fetch>();
const entries = [
  { id: 'entry-a', accountId: 'a', displayName: 'An', position: 1, ready: true },
  { id: 'entry-b', accountId: 'b', displayName: 'Bình', position: 2, ready: true },
];
const swap = {
  id: 'swap-1', senderId: 'b', recipientId: 'a', senderEntryId: 'entry-b',
  recipientEntryId: 'entry-a', expiresAt: '2026-11-28T12:10:00Z', status: 'PENDING',
};
let incoming: typeof swap[];
let outgoing: typeof swap[];
let history: typeof swap[];
let hasNext: boolean;

function props() {
  return {
    buildingId: 'building-a', buildingName: 'Tòa A', accountId: 'a', entries, refreshKey: 0,
    onRefresh: vi.fn().mockResolvedValue(undefined), onSessionExpired: vi.fn(),
  };
}
function reply(url: RequestInfo | URL) {
  const path = String(url);
  if (path.endsWith('/outgoing')) return new Response(JSON.stringify(outgoing));
  return new Response(JSON.stringify({
    items: path.includes('/pending?') ? incoming : history,
    page: Number(new URL(path, 'http://localhost').searchParams.get('page') ?? 0),
    size: 20, hasNext,
  }));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function flush() {
  await act(async () => {});
}
async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
async function click(role: 'tab' | 'button', name: string) {
  await act(async () => { fireEvent.click(screen.getByRole(role, { name })); });
}
async function visibility(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: hidden ? 'hidden' : 'visible' });
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  incoming = []; outgoing = []; history = []; hasNext = false;
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  fetchMock.mockImplementation(async (url) => reply(url));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('shows a newly incoming swap after 12 seconds without disabling or replacing the draft/focused select', async () => {
  render(<SwapsView {...props()} />);
  await flush();
  const select = screen.getByRole('combobox') as HTMLSelectElement;
  fireEvent.change(select, { target: { value: 'entry-b' } });
  select.focus();
  const body = deferred<unknown>();
  fetchMock.mockImplementation(async (url) => {
    if (String(url).includes('/pending?')) {
      return { ok: true, status: 200, json: () => body.promise } as Response;
    }
    return reply(url);
  });
  await advance(11999);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  await advance(1);
  expect(fetchMock).toHaveBeenCalledTimes(6);
  expect(select.disabled).toBe(false);
  expect(select.value).toBe('entry-b');
  expect(document.activeElement).toBe(select);
  await act(async () => { body.resolve({ items: [swap], page: 0, size: 20, hasNext: false }); });
  expect(screen.getByRole('button', { name: 'Đồng ý đổi' })).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Nhận được (1)' })).toBeTruthy();
  expect(screen.getByRole('combobox')).toBe(select);
  expect(select.value).toBe('entry-b');
  expect(document.activeElement).toBe(select);
});

it('schedules the next poll from completion and never overlaps slow reads', async () => {
  render(<SwapsView {...props()} />);
  await flush();
  const pending = deferred<Response>();
  fetchMock.mockImplementationOnce(() => pending.promise);
  await advance(12000);
  await advance(12000);
  expect(fetchMock).toHaveBeenCalledTimes(6);
  await act(async () => { pending.resolve(reply('/swaps/pending?page=0')); });
  await advance(11999);
  expect(fetchMock).toHaveBeenCalledTimes(6);
  await advance(1);
  expect(fetchMock).toHaveBeenCalledTimes(9);
});

it('pauses while hidden and refreshes immediately on return without duplicate timers', async () => {
  render(<SwapsView {...props()} />);
  await flush();
  await visibility(true);
  await advance(60000);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  incoming = [swap];
  await visibility(false);
  expect(fetchMock).toHaveBeenCalledTimes(6);
  expect(screen.getByRole('button', { name: 'Đồng ý đổi' })).toBeTruthy();
  await advance(12000);
  expect(fetchMock).toHaveBeenCalledTimes(9);
});

it('aborts an in-flight silent read while hidden and ignores its late response', async () => {
  const expired = vi.fn();
  render(<SwapsView {...props()} onSessionExpired={expired} />);
  await flush();
  const pending = deferred<Response>();
  fetchMock.mockImplementationOnce(() => pending.promise);
  await advance(12000);
  const signal = fetchMock.mock.calls[3][1]?.signal;
  await visibility(true);
  expect(signal?.aborted).toBe(true);
  await visibility(false);
  expect(fetchMock).toHaveBeenCalledTimes(9);
  await act(async () => { pending.resolve(new Response('{}', { status: 401 })); });
  expect(expired).not.toHaveBeenCalled();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('refreshes outgoing responses and the current history page without resetting pagination', async () => {
  outgoing = [{ ...swap, senderId: 'a', recipientId: 'b' }];
  history = [{ ...swap, status: 'REJECTED' }];
  hasNext = true;
  render(<SwapsView {...props()} />);
  await flush();
  await click('tab', 'Lịch sử');
  await click('button', 'Trang sau');
  expect(screen.getByText('Trang 2')).toBeTruthy();
  outgoing = [];
  history = [{ ...swap, status: 'ACCEPTED' }];
  fetchMock.mockClear();
  await advance(12000);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock).toHaveBeenCalledWith('/api/buildings/building-a/swaps?page=1&size=20', expect.anything());
  expect(screen.getByText('Trang 2')).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Lịch sử' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('tab', { name: 'Đã gửi (0)' })).toBeTruthy();
  expect(screen.getByText('Đã đổi lượt')).toBeTruthy();
});

it('preserves the current incoming page during polling', async () => {
  hasNext = true;
  render(<SwapsView {...props()} />);
  await flush();
  await click('button', 'Trang sau');
  fetchMock.mockClear();
  await advance(12000);
  expect(fetchMock).toHaveBeenCalledWith('/api/buildings/building-a/swaps/pending?page=1&size=20', expect.anything());
  expect(screen.getByText('Trang 2')).toBeTruthy();
});

it('lets manual navigation supersede a silent read and rejects its stale JSON body', async () => {
  render(<SwapsView {...props()} />);
  await flush();
  const body = deferred<unknown>();
  fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, json: () => body.promise }) as Response);
  await advance(12000);
  const signal = fetchMock.mock.calls[3][1]?.signal;
  await click('tab', 'Lịch sử');
  expect(signal?.aborted).toBe(true);
  expect(screen.getByRole('tab', { name: 'Lịch sử' }).getAttribute('aria-selected')).toBe('true');
  await act(async () => { body.resolve({ items: [swap], page: 0, size: 20, hasNext: false }); });
  expect(screen.getByRole('tab', { name: 'Lịch sử' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.queryByRole('button', { name: 'Đồng ý đổi' })).toBeNull();
});

it('allows a user mutation to cancel a silent poll but does not poll or submit again during that mutation', async () => {
  render(<SwapsView {...props()} />);
  await flush();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'entry-b' } });
  const read = deferred<Response>();
  fetchMock.mockImplementationOnce(() => read.promise);
  await advance(12000);
  const signal = fetchMock.mock.calls[3][1]?.signal;
  const mutation = deferred<Response>();
  fetchMock.mockImplementation((url, init) => init?.method === 'POST' ? mutation.promise : Promise.resolve(reply(url)));
  await click('button', 'Gửi lời mời');
  expect(signal?.aborted).toBe(true);
  await click('button', 'Gửi lời mời');
  await visibility(true);
  await visibility(false);
  await advance(12000);
  expect(fetchMock).toHaveBeenCalledTimes(7);
  await act(async () => { mutation.resolve(new Response('{}')); });
  expect(screen.getByRole('status').textContent).toContain('Đã gửi lời mời');
  await advance(12000);
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  expect(screen.getByRole('status').textContent).toContain('Đã gửi lời mời');
  await act(async () => { read.resolve(reply('/swaps/pending?page=0')); });
});

it('bounds a stalled JSON body, blocks stale actions, discards its late result, and recovers on the next read', async () => {
  incoming = [swap];
  render(<SwapsView {...props()} />);
  await flush();
  const select = screen.getByRole('combobox') as HTMLSelectElement;
  fireEvent.change(select, { target: { value: 'entry-b' } });
  const send = screen.getByRole('button', { name: 'Gửi lời mời' }) as HTMLButtonElement;
  const accept = screen.getByRole('button', { name: 'Đồng ý đổi' }) as HTMLButtonElement;
  const reject = screen.getByRole('button', { name: 'Từ chối' }) as HTMLButtonElement;
  const body = deferred<unknown>();
  fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, json: () => body.promise }) as Response);
  await advance(12000);
  const signal = fetchMock.mock.calls[3][1]?.signal;
  await advance(14999);
  expect([select.disabled, send.disabled, accept.disabled, reject.disabled]).toEqual([false, false, false, false]);
  await advance(1);
  expect(signal?.aborted).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('quá thời gian');
  expect([select.disabled, send.disabled, accept.disabled, reject.disabled]).toEqual([true, true, true, true]);
  await act(async () => { body.resolve({ items: [], page: 0, size: 20, hasNext: false }); });
  expect(screen.getByRole('button', { name: 'Đồng ý đổi' })).toBe(accept);
  expect(accept.disabled).toBe(true);
  await advance(12000);
  expect(fetchMock).toHaveBeenCalledTimes(9);
  expect(screen.queryByRole('alert')).toBeNull();
  expect([select.disabled, send.disabled, accept.disabled, reject.disabled]).toEqual([false, false, false, false]);
  expect(select.value).toBe('entry-b');
  expect(fetchMock.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
});

it('blocks stale actions after a silent 502 until a complete successful poll, preserving the draft', async () => {
  incoming = [swap];
  render(<SwapsView {...props()} />);
  await flush();
  const select = screen.getByRole('combobox') as HTMLSelectElement;
  fireEvent.change(select, { target: { value: 'entry-b' } });
  const send = screen.getByRole('button', { name: 'Gửi lời mời' }) as HTMLButtonElement;
  const accept = screen.getByRole('button', { name: 'Đồng ý đổi' }) as HTMLButtonElement;
  const reject = screen.getByRole('button', { name: 'Từ chối' }) as HTMLButtonElement;
  expect([select.disabled, send.disabled, accept.disabled, reject.disabled]).toEqual([false, false, false, false]);
  fetchMock.mockImplementationOnce(async () => new Response('{}', { status: 502 }));
  await advance(12000);
  expect(screen.getByRole('alert').textContent).toContain('Không tải được');
  expect([select.disabled, send.disabled, accept.disabled, reject.disabled]).toEqual([true, true, true, true]);
  await click('button', 'Gửi lời mời');
  await click('button', 'Đồng ý đổi');
  await click('button', 'Từ chối');
  expect(fetchMock).toHaveBeenCalledTimes(6);
  const body = deferred<unknown>();
  fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, json: () => body.promise }) as Response);
  await advance(12000);
  expect([select.disabled, send.disabled, accept.disabled, reject.disabled]).toEqual([true, true, true, true]);
  await act(async () => { body.resolve({ items: [swap], page: 0, size: 20, hasNext: false }); });
  expect(screen.queryByRole('alert')).toBeNull();
  expect([select.disabled, send.disabled, accept.disabled, reject.disabled]).toEqual([false, false, false, false]);
  expect(select.value).toBe('entry-b');
  expect(fetchMock.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
});

it('offers a read-only explicit reload while stale actions and tabs are blocked', async () => {
  outgoing = [{ ...swap, senderId: 'a', recipientId: 'b' }];
  const callbacks = props();
  render(<SwapsView {...callbacks} />);
  await flush();
  await click('tab', 'Đã gửi (1)');
  const cancel = screen.getByRole('button', { name: 'Hủy lời mời' }) as HTMLButtonElement;
  expect(cancel.disabled).toBe(false);
  fetchMock.mockImplementationOnce(async () => new Response('{}', { status: 502 }));
  await advance(12000);
  expect(cancel.disabled).toBe(true);
  expect((screen.getByRole('tab', { name: 'Lịch sử' }) as HTMLButtonElement).disabled).toBe(true);
  const reload = screen.getByRole('button', { name: 'Tải lại danh sách đổi lượt' }) as HTMLButtonElement;
  expect(reload.disabled).toBe(false);
  const body = deferred<unknown>();
  fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, json: () => body.promise }) as Response);
  await click('button', 'Tải lại danh sách đổi lượt');
  expect(reload.disabled).toBe(true);
  await click('button', 'Tải lại danh sách đổi lượt');
  expect(fetchMock).toHaveBeenCalledTimes(12);
  await act(async () => { body.resolve({ items: [], page: 0, size: 20, hasNext: false }); });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(cancel.disabled).toBe(false);
  expect(screen.getByRole('tab', { name: 'Đã gửi (1)' }).getAttribute('aria-selected')).toBe('true');
  expect(fetchMock.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
  expect(callbacks.onRefresh).not.toHaveBeenCalled();
});

it('bounds a stalled mutation and resumes only reads, never retrying the POST', async () => {
  const callbacks = props();
  render(<SwapsView {...callbacks} />);
  await flush();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'entry-b' } });
  const mutation = deferred<Response>();
  fetchMock.mockImplementation((url, init) => init?.method === 'POST' ? mutation.promise : Promise.resolve(reply(url)));
  await click('button', 'Gửi lời mời');
  await advance(12000);
  expect(fetchMock).toHaveBeenCalledTimes(4);
  await advance(3000);
  expect(screen.getByRole('alert').textContent).toContain('quá thời gian');
  await advance(12000);
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  expect(fetchMock).toHaveBeenCalledTimes(7);
  await act(async () => { mutation.resolve(new Response('{}')); });
  expect(callbacks.onRefresh).not.toHaveBeenCalled();
  expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('entry-b');
});

it('does not start even the initial read in a hidden tab', async () => {
  await visibility(true);
  render(<SwapsView {...props()} />);
  await flush();
  await advance(60000);
  expect(fetchMock).not.toHaveBeenCalled();
  await visibility(false);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(false);
});

it('still honors explicit parent refreshes without losing the active history page', async () => {
  hasNext = true;
  const callbacks = props();
  const view = render(<SwapsView {...callbacks} />);
  await flush();
  await click('tab', 'Lịch sử');
  await click('button', 'Trang sau');
  fetchMock.mockClear();
  view.rerender(<SwapsView {...callbacks} refreshKey={1} />);
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock).toHaveBeenCalledWith('/api/buildings/building-a/swaps?page=1&size=20', expect.anything());
  expect(screen.getByText('Trang 2')).toBeTruthy();
});

it('aborts old scope requests on building/account changes and stops polling on unmount', async () => {
  const callbacks = props();
  const pending = deferred<Response>();
  fetchMock.mockImplementationOnce(() => pending.promise);
  const view = render(<SwapsView {...callbacks} />);
  await flush();
  const signal = fetchMock.mock.calls[0][1]?.signal;
  view.rerender(<SwapsView {...callbacks} buildingId="building-b" accountId="b" />);
  await flush();
  expect(signal?.aborted).toBe(true);
  expect(fetchMock).toHaveBeenCalledWith('/api/buildings/building-b/swaps/outgoing', expect.anything());
  await act(async () => { pending.resolve(new Response('{}', { status: 401 })); });
  expect(callbacks.onSessionExpired).not.toHaveBeenCalled();
  view.unmount();
  const count = fetchMock.mock.calls.length;
  await advance(60000);
  expect(fetchMock).toHaveBeenCalledTimes(count);
});
