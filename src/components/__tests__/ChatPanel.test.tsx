// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ChatPanel from '../ChatPanel';
const fetchMock = vi.fn<typeof fetch>();
const message = { id: 'm', authorId: 'a', displayName: 'Alice', body: '<img src=x onerror=alert(1)> **text**', sentAt: '2026-11-25T00:00:00Z', hiddenAt: null };
const page = (items = [message]) => new Response(JSON.stringify({ items, page: 0, size: 30, hasNext: false }), { status: 200 });
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); fetchMock.mockImplementation(async () => page()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function ready() { await waitFor(() => expect(screen.getByRole('button', { name: 'Gửi tin nhắn' }).hasAttribute('disabled')).toBe(true)); await screen.findByText('Alice'); }
async function click(name: string) { await act(async () => { fireEvent.click(screen.getByRole('button', { name })); }); }
it('renders plain escaped text without manager controls', async () => {
  const view = render(<ChatPanel buildingId="b" accountId="a" onSessionExpired={vi.fn()} />); await ready();
  expect(screen.getByText(message.body).textContent).toBe(message.body);expect(view.container.querySelector('img')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Ẩn tin nhắn của Alice' })).toBeNull();
});
it('sends UUID once and blocks until refresh completes', async () => {
  render(<ChatPanel buildingId="b" accountId="a" onSessionExpired={vi.fn()} />);await ready();
  fireEvent.change(screen.getByRole('textbox', { name: 'Tin nhắn' }), { target: { value: ' hello ' } });
  let finish!: (value: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await click('Gửi tin nhắn'); await click('Gửi tin nhắn');
  const mutations = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');expect(mutations).toHaveLength(1);
  expect(JSON.parse(mutations[0][1]!.body as string)).toEqual({ body: 'hello', clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  await act(async () => finish(page()));expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
});
it('keeps mutations blocked on refresh failure and notifies expired session', async () => {
  const expired = vi.fn();render(<ChatPanel buildingId="b" accountId="a" onSessionExpired={expired} />);await ready();
  fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));await click('Tải lại trò chuyện');
  expect(expired).toHaveBeenCalledOnce();expect(screen.getByRole('textbox').hasAttribute('disabled')).toBe(true);
});
it('aborts old scope when changing buildings and ignores late content', async () => {
  let finish!: (value: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<ChatPanel buildingId="old" accountId="a" onSessionExpired={vi.fn()} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const signal = fetchMock.mock.calls[0][1]!.signal!;
  view.rerender(<ChatPanel buildingId="new" accountId="a" onSessionExpired={vi.fn()} />);await ready();
  expect(signal.aborted).toBe(true);
  await act(async () => finish(page([{ ...message, body: 'old secret' }])));expect(screen.queryByText('old secret')).toBeNull();
});
it('manager gets reports and can hide with an allowlisted reason', async () => {
  fetchMock.mockImplementation(async url => String(url).includes('/reports') ? page([]) : page());
  render(<ChatPanel buildingId="b" accountId="a" isManager onSessionExpired={vi.fn()} />);await ready();
  await click('Ẩn tin nhắn của Alice');
  expect(fetchMock).toHaveBeenCalledWith('/api/buildings/b/chat/messages/m/hide', expect.objectContaining({ method: 'POST', body: JSON.stringify({ reasonCode: 'SPAM' }) }));
});
