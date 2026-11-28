// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PushNotificationSettings from '../PushNotificationSettings';
import { apiJson } from '@/lib/api-json';
import { pushEnvironment, registerPushWorker } from '@/lib/web-push';

vi.mock('@/lib/api-json', () => ({ apiJson: vi.fn() }));
vi.mock('@/lib/web-push', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/web-push')>(), pushEnvironment: vi.fn(), registerPushWorker: vi.fn(),
}));
const api = vi.mocked(apiJson);
const environment = vi.mocked(pushEnvironment);
const register = vi.mocked(registerPushWorker);
const permission = vi.fn();
const getSubscription = vi.fn();
const subscribe = vi.fn();
const unsubscribe = vi.fn();
const endpoint = 'https://fcm.googleapis.com/fcm/send/device';
const subscription = { endpoint, options: {}, toJSON: () => ({ endpoint, keys: { p256dh: 'key', auth: 'auth' } }), unsubscribe };

beforeEach(() => {
  vi.resetAllMocks();
  environment.mockReturnValue({ supported: true, needsInstall: false });
  vi.stubGlobal('Notification', { permission: 'default', requestPermission: permission });
  permission.mockResolvedValue('granted');
  getSubscription.mockResolvedValue(null);
  subscribe.mockResolvedValue(subscription);
  unsubscribe.mockResolvedValue(true);
  register.mockResolvedValue({ active: {}, pushManager: { getSubscription, subscribe } } as unknown as ServiceWorkerRegistration);
  api.mockImplementation(async (url) => url === '/api/push/config'
    ? { ok: true, status: 200, data: { enabled: true, publicKey: 'BA' } }
    : { ok: true, status: 200, data: { subscribed: false } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('device push settings', () => {
  it('shows iPhone installation steps without requesting permission', async () => {
    environment.mockReturnValue({ supported: false, needsInstall: true });
    render(<PushNotificationSettings />);
    expect(await screen.findByText('iPhone: thêm web vào Màn hình chính trước')).toBeTruthy();
    expect(screen.getByText(/iPhone 12 Pro Max hỗ trợ/)).toBeTruthy();
    expect(permission).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });
  it('does not prompt on mount; enables only on explicit click and persists keys', async () => {
    render(<PushNotificationSettings />);
    const button = await screen.findByRole('button', { name: 'Bật thông báo đến lượt' });
    expect(permission).not.toHaveBeenCalled();
    fireEvent.click(button);
    await screen.findByText('Đã bật cho tài khoản này trên thiết bị này.');
    expect(permission).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) });
    expect(api).toHaveBeenCalledWith('/api/push/subscriptions', expect.objectContaining({ method: 'POST', body: JSON.stringify(subscription.toJSON()) }));
  });
  it('shows missing server configuration honestly', async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: { enabled: false, publicKey: null } });
    render(<PushNotificationSettings />);
    expect(await screen.findByText(/Máy chủ chưa bật dịch vụ Web Push/)).toBeTruthy();
    expect(screen.getByText(/Nhắc lấy đồ không xác nhận máy đã dừng/)).toBeTruthy();
    expect(register).not.toHaveBeenCalled();
  });
  it('handles blocked permission without subscribing', async () => {
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission: permission });
    render(<PushNotificationSettings />);
    expect(await screen.findByText(/Thông báo đang bị chặn/)).toBeTruthy();
    expect(subscribe).not.toHaveBeenCalled();
  });
  it('does not claim enabled if persistence fails and supports a retry', async () => {
    api.mockImplementation(async url => url === '/api/push/config'
      ? { ok: true, status: 200, data: { enabled: true, publicKey: 'BA' } }
      : { ok: false, status: 502, error: 'Không lưu được thiết bị.' });
    render(<PushNotificationSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bật thông báo đến lượt' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Không lưu được thiết bị.');
    expect(screen.queryByText('Đã bật cho tài khoản này trên thiết bị này.')).toBeNull();
  });
  it('deletes server subscription before browser unsubscribe', async () => {
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: permission });
    getSubscription.mockResolvedValue(subscription);
    api.mockImplementation(async url => url === '/api/push/config'
      ? { ok: true, status: 200, data: { enabled: true, publicKey: 'BA' } }
      : { ok: true, status: 200, data: { subscribed: true } });
    render(<PushNotificationSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tắt trên thiết bị này' }));
    await screen.findByText('Chưa bật cho tài khoản này trên thiết bị này.');
    expect(api).toHaveBeenCalledWith('/api/push/subscriptions', expect.objectContaining({ method: 'DELETE' }));
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('reports server delivery off even when browser unsubscribe fails', async () => {
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: permission });
    getSubscription.mockResolvedValue(subscription);
    unsubscribe.mockRejectedValue(new Error('browser failure'));
    api.mockImplementation(async url => url === '/api/push/config'
      ? { ok: true, status: 200, data: { enabled: true, publicKey: 'BA' } }
      : { ok: true, status: 200, data: { subscribed: true } });
    render(<PushNotificationSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tắt trên thiết bị này' }));
    await screen.findByText('Chưa bật cho tài khoản này trên thiết bị này.');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Đã tắt nhận trên máy chủ; trình duyệt chưa dọn xong đăng ký cục bộ.');
    expect(screen.getByRole('button', { name: 'Bật thông báo đến lượt' })).toBeTruthy();
  });
  it('rechecks state after logout cleanup even if the logout request later fails', async () => {
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: permission });
    getSubscription.mockResolvedValue(subscription);
    api.mockImplementation(async url => url === '/api/push/config'
      ? { ok: true, status: 200, data: { enabled: true, publicKey: 'BA' } }
      : { ok: true, status: 200, data: { subscribed: true } });
    render(<PushNotificationSettings />);
    await screen.findByText('Đã bật cho tài khoản này trên thiết bị này.');
    getSubscription.mockResolvedValue(null);
    act(() => { window.dispatchEvent(new Event('laundry-push-changed')); });
    await screen.findByRole('button', { name: 'Bật thông báo đến lượt' });
    expect(screen.queryByText('Đã bật cho tài khoản này trên thiết bị này.')).toBeNull();
  });
  it('does not persist a subscription after unmount while permission prompt is pending', async () => {
    let grant!: (value: NotificationPermission) => void;
    permission.mockReturnValue(new Promise(resolve => { grant = resolve; }));
    const view = render(<PushNotificationSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bật thông báo đến lượt' }));
    view.unmount();
    await act(async () => { grant('granted'); });
    expect(subscribe).not.toHaveBeenCalled();
    expect(api.mock.calls.filter(([url]) => url === '/api/push/subscriptions')).toHaveLength(0);
  });
  it('checks existing subscription ownership rather than assuming browser permission is enough', async () => {
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: permission });
    getSubscription.mockResolvedValue(subscription);
    render(<PushNotificationSettings />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bật thông báo đến lượt' })).toBeTruthy());
    expect(api).toHaveBeenCalledWith('/api/push/subscriptions/status', expect.objectContaining({ body: JSON.stringify({ endpoint }) }));
  });
});
