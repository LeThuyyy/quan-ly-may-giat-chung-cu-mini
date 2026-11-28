import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function worker() {
  const listeners: Record<string, (event: unknown) => void> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const matchAll = vi.fn().mockResolvedValue([]);
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    URL,
    self: {
      addEventListener: (name: string, handler: (event: unknown) => void) => { listeners[name] = handler; },
      location: { origin: 'https://laundry.example' }, registration: { showNotification },
      clients: { openWindow, matchAll }, skipWaiting: vi.fn(),
    },
  });
  async function push(payload: unknown) {
    let work: Promise<unknown> = Promise.resolve();
    listeners.push({ data: { json: () => payload }, waitUntil: (promise: Promise<unknown>) => { work = promise; } });
    await work;
  }
  async function click(url: string) {
    let work: Promise<unknown> = Promise.resolve();
    const close = vi.fn();
    listeners.notificationclick({ notification: { data: { url }, close }, waitUntil: (promise: Promise<unknown>) => { work = promise; } });
    await work;
    expect(close).toHaveBeenCalledOnce();
  }
  return { push, click, showNotification, openWindow, matchAll, listeners };
}
const path = '/buildings/11111111-1111-4111-8111-111111111111/overview';

describe('push-only service worker', () => {
  it('always shows a user-visible notification with stable hold tag', async () => {
    const w = worker();
    await w.push({ body: 'Kiểm tra máy trước 20:38', url: path, tag: 'hold:123' });
    expect(w.showNotification).toHaveBeenCalledWith('Đến lượt giặt của bạn', expect.objectContaining({ body: 'Kiểm tra máy trước 20:38', tag: 'hold:123', data: { url: `https://laundry.example${path}` } }));
    expect(w.listeners.fetch).toBeUndefined();
  });
  it('shows estimated finish reminder without claiming the machine stopped', async () => {
    const w = worker();
    const body = 'Hãy lên kiểm tra và lấy đồ nếu máy đã dừng.';
    await w.push({ title: 'Đã đến giờ giặt xong dự kiến', body, url: path, tag: 'pickup:123' });
    expect(w.showNotification).toHaveBeenCalledWith('Đã đến giờ giặt xong dự kiến', expect.objectContaining({ body, tag: 'pickup:123' }));
  });
  it('does not display arbitrary push titles', async () => {
    const w = worker();
    await w.push({ title: 'Máy đã dừng, hãy khởi động ngay' });
    expect(w.showNotification).toHaveBeenCalledWith('Đến lượt giặt của bạn', expect.anything());
  });
  it.each(['https://evil.example/login', '//evil.example', '/api/auth/logout', `${path}?token=secret`])('rejects unsafe notification navigation %s', async url => {
    const w = worker();
    await w.click(url);
    expect(w.openWindow).toHaveBeenCalledWith('https://laundry.example/buildings');
  });
  it('reuses and navigates an open app window before focusing it', async () => {
    const w = worker();
    const focus = vi.fn();
    const navigate = vi.fn().mockResolvedValue({ focus });
    w.matchAll.mockResolvedValue([{ url: 'https://laundry.example/account', navigate }]);
    await w.click(path);
    expect(navigate).toHaveBeenCalledWith(`https://laundry.example${path}`);
    expect(focus).toHaveBeenCalledOnce();
    expect(w.openWindow).not.toHaveBeenCalled();
  });
  it.each([null, [], 'not-json-object'])('falls back for invalid payload %j', async payload => {
    const w = worker();
    await w.push(payload);
    expect(w.showNotification).toHaveBeenCalledOnce();
  });
});
